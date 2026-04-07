"""
Centralized logging configuration for NFS-MergerFS Manager.

Sets up structured logging with:
- Console handler (colored, human-readable)
- File handler (rotated, machine-parseable)
- Per-module loggers under the "nfs-manager" hierarchy
"""

import logging
import logging.handlers
import os
import sys

LOG_DIR = "/var/log/nfs-manager"
LOG_FILE = os.path.join(LOG_DIR, "nfs-manager.log")

# Structured format for file logs
FILE_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)-30s | %(message)s"
FILE_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

# Colored console format
CONSOLE_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)-30s | %(message)s"
CONSOLE_DATE_FORMAT = "%H:%M:%S"


def setup_logging(level: str = "INFO") -> None:
    """Initialize the logging system. Call once at startup."""
    numeric_level = getattr(logging, level.upper(), logging.INFO)

    # Root "nfs-manager" logger
    root_logger = logging.getLogger("nfs-manager")
    root_logger.setLevel(numeric_level)
    root_logger.propagate = False

    # Clear existing handlers (in case of reload)
    root_logger.handlers.clear()

    # --- Console Handler ---
    console = logging.StreamHandler(sys.stdout)
    console.setLevel(numeric_level)
    console.setFormatter(logging.Formatter(CONSOLE_FORMAT, datefmt=CONSOLE_DATE_FORMAT))
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
