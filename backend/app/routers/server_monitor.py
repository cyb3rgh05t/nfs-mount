import logging
import asyncio
import base64
import os
import re
import shutil
import struct
import subprocess

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import verify_api_key
from ..database import get_db
from ..models.server_monitor import MonitorServer
from ..schemas.server_monitor import (
    MonitorServerCreate,
    MonitorServerResponse,
    MonitorServerUpdate,
    ServerMetrics,
)
from ..services import server_monitor_service

logger = logging.getLogger("nfs-manager.router.monitor")

SSH_KEY_DIR = "/config/ssh"

router = APIRouter(dependencies=[Depends(verify_api_key)])


@router.get("/servers", response_model=list[MonitorServerResponse])
async def list_servers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MonitorServer).order_by(MonitorServer.name))
    return result.scalars().all()


@router.post("/servers", response_model=MonitorServerResponse, status_code=201)
async def create_server(data: MonitorServerCreate, db: AsyncSession = Depends(get_db)):
    server = MonitorServer(**data.model_dump())
    db.add(server)
    await db.commit()
    await db.refresh(server)
    logger.info(f"Monitor server created: {server.name} ({server.host})")
    return server


@router.put("/servers/{server_id}", response_model=MonitorServerResponse)
async def update_server(
    server_id: int, data: MonitorServerUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(MonitorServer).where(MonitorServer.id == server_id)
    )
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(server, key, value)
    await db.commit()
    await db.refresh(server)
    logger.info(f"Monitor server updated: {server.name}")
    return server


@router.delete("/servers/{server_id}", status_code=204)
async def delete_server(server_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MonitorServer).where(MonitorServer.id == server_id)
    )
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    await db.delete(server)
    await db.commit()
    logger.info(f"Monitor server deleted: {server.name}")


@router.get("/servers/{server_id}/metrics", response_model=ServerMetrics)
async def get_server_metrics(server_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MonitorServer).where(MonitorServer.id == server_id)
    )
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    metrics = await server_monitor_service.collect_metrics(
        host=server.host,
        port=server.port,
        username=server.username,
        key_path=server.ssh_key_path,
        server_id=server.id,
    )
    return metrics


@router.get("/metrics", response_model=list[ServerMetrics])
async def get_all_metrics(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MonitorServer)
        .where(MonitorServer.enabled == True)
        .order_by(MonitorServer.name)
    )
    servers = result.scalars().all()

    if not servers:
        return []

    tasks = [
        server_monitor_service.collect_metrics(
            host=s.host,
            port=s.port,
            username=s.username,
            key_path=s.ssh_key_path,
            server_id=s.id,
        )
        for s in servers
    ]
    metrics = await asyncio.gather(*tasks, return_exceptions=True)

    results = []
    for s, m in zip(servers, metrics):
        if isinstance(m, Exception):
            results.append(
                {
                    "server_id": s.id,
                    "hostname": s.name,
                    "online": False,
                    "error": str(m),
                }
            )
        elif isinstance(m, dict):
            m["hostname"] = s.name
            results.append(m)

    return results


@router.post("/servers/{server_id}/test")
async def test_server_connection(server_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MonitorServer).where(MonitorServer.id == server_id)
    )
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    test_result = await server_monitor_service.test_connection(
        host=server.host,
        port=server.port,
        username=server.username,
        key_path=server.ssh_key_path,
    )
    return test_result


# --- SSH Key Management ---

_SAFE_FILENAME = re.compile(r"^[a-zA-Z0-9_\-\.]+$")


def _validate_key_filename(filename: str) -> str:
    """Validate and sanitize SSH key filename."""
    name = os.path.basename(filename)
    if not name or not _SAFE_FILENAME.match(name):
        raise HTTPException(status_code=400, detail="Invalid filename")
    return name


def _read_ppk_mpint(data: bytes, offset: int):
    """Read an SSH mpint from PPK blob."""
    length = struct.unpack(">I", data[offset : offset + 4])[0]
    value = int.from_bytes(data[offset + 4 : offset + 4 + length], "big")
    return value, offset + 4 + length


def _read_ppk_string(data: bytes, offset: int):
    """Read an SSH string from PPK blob."""
    length = struct.unpack(">I", data[offset : offset + 4])[0]
    value = data[offset + 4 : offset + 4 + length]
    return value, offset + 4 + length


def _convert_ppk_native(ppk_path: str, output_path: str) -> None:
    """Convert unencrypted PPK v2/v3 to OpenSSH PEM using cryptography lib."""
    from cryptography.hazmat.primitives.asymmetric import ec, ed25519, rsa
    from cryptography.hazmat.primitives import serialization

    with open(ppk_path, "r", encoding="utf-8", errors="replace") as f:
        lines = f.read().splitlines()

    key_type = None
    encryption = "none"
    public_lines = []
    private_lines = []
    current_section = None
    remaining = 0

    for line in lines:
        if remaining > 0:
            if current_section == "public":
                public_lines.append(line)
            elif current_section == "private":
                private_lines.append(line)
            remaining -= 1
            continue

        if line.startswith("PuTTY-User-Key-File-"):
            key_type = line.split(": ", 1)[1].strip()
        elif line.startswith("Encryption: "):
            encryption = line.split(": ", 1)[1].strip()
        elif line.startswith("Public-Lines: "):
            current_section = "public"
            remaining = int(line.split(": ", 1)[1])
        elif line.startswith("Private-Lines: "):
            current_section = "private"
            remaining = int(line.split(": ", 1)[1])

    if encryption != "none":
        raise ValueError(
            "Encrypted PPK keys are not supported. "
            "Remove the passphrase in PuTTYgen first, then re-upload."
        )

    if not key_type or not public_lines or not private_lines:
        raise ValueError("Invalid or corrupted PPK file")

    pub_blob = base64.b64decode("".join(public_lines))
    priv_blob = base64.b64decode("".join(private_lines))

    if key_type == "ssh-rsa":
        _, off = _read_ppk_string(pub_blob, 0)  # "ssh-rsa"
        e, off = _read_ppk_mpint(pub_blob, off)
        n, off = _read_ppk_mpint(pub_blob, off)
        d, off = _read_ppk_mpint(priv_blob, 0)
        p, off = _read_ppk_mpint(priv_blob, off)
        q, off = _read_ppk_mpint(priv_blob, off)
        iqmp, off = _read_ppk_mpint(priv_blob, off)
        private_key = rsa.RSAPrivateNumbers(
            p=p,
            q=q,
            d=d,
            dmp1=d % (p - 1),
            dmq1=d % (q - 1),
            iqmp=iqmp,
            public_numbers=rsa.RSAPublicNumbers(e=e, n=n),
        ).private_key()

    elif key_type == "ssh-ed25519":
        _, off = _read_ppk_string(pub_blob, 0)
        pub_bytes, _ = _read_ppk_string(pub_blob, off)
        priv_bytes, _ = _read_ppk_string(priv_blob, 0)
        private_key = ed25519.Ed25519PrivateKey.from_private_bytes(priv_bytes[:32])

    elif key_type.startswith("ecdsa-sha2-"):
        _, off = _read_ppk_string(pub_blob, 0)
        curve_name_b, off = _read_ppk_string(pub_blob, off)
        point_bytes, off = _read_ppk_string(pub_blob, off)
        curve_name = curve_name_b.decode()
        priv_value, _ = _read_ppk_mpint(priv_blob, 0)
        curve_map = {
            "nistp256": ec.SECP256R1(),
            "nistp384": ec.SECP384R1(),
            "nistp521": ec.SECP521R1(),
        }
        curve = curve_map.get(curve_name)
        if not curve:
            raise ValueError(f"Unsupported ECDSA curve: {curve_name}")
        pub_key = ec.EllipticCurvePublicKey.from_encoded_point(curve, point_bytes)
        private_key = ec.EllipticCurvePrivateNumbers(
            private_value=priv_value, public_numbers=pub_key.public_numbers()
        ).private_key()
    else:
        raise ValueError(f"Unsupported PPK key type: {key_type}")

    pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.OpenSSH,
        encryption_algorithm=serialization.NoEncryption(),
    )
    with open(output_path, "wb") as f:
        f.write(pem)


def _convert_ppk(ppk_path: str, output_path: str) -> None:
    """Convert PPK to OpenSSH format. Tries puttygen first, then Python-native."""
    if shutil.which("puttygen"):
        subprocess.run(
            ["puttygen", ppk_path, "-O", "private-openssh", "-o", output_path],
            check=True,
            capture_output=True,
            timeout=10,
        )
        return
    _convert_ppk_native(ppk_path, output_path)


@router.get("/ssh-keys")
async def list_ssh_keys():
    """List available SSH keys in /config/ssh/."""
    if not os.path.isdir(SSH_KEY_DIR):
        return []
    keys = []
    for f in sorted(os.listdir(SSH_KEY_DIR)):
        filepath = os.path.join(SSH_KEY_DIR, f)
        if os.path.isfile(filepath):
            stat = os.stat(filepath)
            keys.append(
                {
                    "name": f,
                    "size": stat.st_size,
                    "permissions": oct(stat.st_mode)[-3:],
                }
            )
    return keys


@router.post("/ssh-keys")
async def upload_ssh_key(file: UploadFile = File(...)):
    """Upload an SSH key to /config/ssh/."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    name = _validate_key_filename(file.filename)
    os.makedirs(SSH_KEY_DIR, exist_ok=True)
    filepath = os.path.join(SSH_KEY_DIR, name)

    content = await file.read()
    if len(content) > 64 * 1024:  # 64KB max
        raise HTTPException(status_code=400, detail="File too large (max 64KB)")

    with open(filepath, "wb") as f:
        f.write(content)

    # Convert PPK to OpenSSH format if needed
    if name.lower().endswith(".ppk"):
        converted_name = name.rsplit(".", 1)[0]
        converted_path = os.path.join(SSH_KEY_DIR, converted_name)
        try:
            _convert_ppk(filepath, converted_path)
            os.remove(filepath)  # Remove original .ppk
            filepath = converted_path
            name = converted_name
            logger.info(f"Converted PPK key to OpenSSH format: {name}")
        except Exception as e:
            if os.path.exists(filepath):
                os.remove(filepath)
            if os.path.exists(converted_path):
                os.remove(converted_path)
            raise HTTPException(
                status_code=400,
                detail=f"Failed to convert PPK key: {str(e)}",
            )

    # Set proper permissions (600) for private keys
    os.chmod(filepath, 0o600)
    logger.info(f"SSH key uploaded: {name}")
    return {"name": name, "size": len(content)}


@router.get("/ssh-keys/{filename}")
async def download_ssh_key(filename: str):
    """Download an SSH key from /config/ssh/."""
    name = _validate_key_filename(filename)
    filepath = os.path.join(SSH_KEY_DIR, name)
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="Key not found")
    return FileResponse(filepath, filename=name, media_type="application/octet-stream")


@router.delete("/ssh-keys/{filename}", status_code=204)
async def delete_ssh_key(filename: str):
    """Delete an SSH key from /config/ssh/."""
    name = _validate_key_filename(filename)
    filepath = os.path.join(SSH_KEY_DIR, name)
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="Key not found")
    os.remove(filepath)
    logger.info(f"SSH key deleted: {name}")
