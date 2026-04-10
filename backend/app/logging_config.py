"""
Centralized logging configuration for NFS-MergerFS Manager.

Sets up structured logging with:
- Console handler (colored, human-readable)
- File handler (rotated, machine-parseable) in /data/logs/
- Per-module loggers under the "nfs-manager" hierarchy
"""

import logging
import logging.handlers
import os
import sys

LOG_DIR = "/data/logs"
LOG_FILE = os.path.join(LOG_DIR, "nfs-manager.log")

# Structured format for file logs (no color codes)
FILE_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)-30s | %(message)s"
FILE_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

# ── ANSI color codes ──
_RESET = "\033[0m"
_DIM = "\033[2m"
_BOLD = "\033[1m"
_COLORS = {
    "DEBUG": "\033[36m",  # cyan
    "INFO": "\033[32m",  # green
    "WARNING": "\033[33m",  # yellow
    "ERROR": "\033[31m",  # red
    "CRITICAL": "\033[1;31m",  # bold red
}
_NAME_COLOR = "\033[38;5;244m"  # gray


class ColorFormatter(logging.Formatter):
    """Console formatter with ANSI colors for level, dimmed timestamp, gray logger name."""

    def format(self, record: logging.LogRecord) -> str:
        lvl = record.levelname
        color = _COLORS.get(lvl, "")
        # Shorten logger name: "nfs-manager.services.nfs_service" → "services.nfs_service"
        name = record.name
        if name.startswith("nfs-manager."):
            name = name[len("nfs-manager.") :]
        ts = self.formatTime(record, "%H:%M:%S")
        msg = record.getMessage()
        # Handle exceptions
        if record.exc_info and not record.exc_text:
            record.exc_text = self.formatException(record.exc_info)
        if record.exc_text:
            msg = msg + "\n" + record.exc_text
        return (
            f"{_DIM}{ts}{_RESET} "
            f"{color}{_BOLD}{lvl:<8}{_RESET} "
            f"{_NAME_COLOR}{name:<28}{_RESET} "
            f"{msg}"
        )


def setup_logging(level: str = "INFO") -> None:
    """Initialize the logging system. Call once at startup."""
    numeric_level = getattr(logging, level.upper(), logging.INFO)

    # Root "nfs-manager" logger
    root_logger = logging.getLogger("nfs-manager")
    root_logger.setLevel(numeric_level)
    root_logger.propagate = False

    # Clear existing handlers (in case of reload)
    root_logger.handlers.clear()

    # --- Console Handler (colored) ---
    console = logging.StreamHandler(sys.stdout)
    console.setLevel(numeric_level)
    console.setFormatter(ColorFormatter())
    root_logger.addHandler(console)

    # --- File Handler (rotating, 5 MB, keep 3 backups) ---
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        file_handler = logging.handlers.RotatingFileHandler(
            LOG_FILE,
            maxBytes=5 * 1024 * 1024,
            backupCount=3,
            encoding="utf-8",
        )
        file_handler.setLevel(numeric_level)
        file_handler.setFormatter(
            logging.Formatter(FILE_FORMAT, datefmt=FILE_DATE_FORMAT)
        )
        root_logger.addHandler(file_handler)
    except (OSError, PermissionError) as e:
        root_logger.warning(f"Could not create log file at {LOG_FILE}: {e}")

    # Quiet noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)

    root_logger.info(
        "Logging initialized (level=%s, file=%s)",
        level.upper(),
        LOG_FILE if os.path.isdir(LOG_DIR) else "console-only",
    )
