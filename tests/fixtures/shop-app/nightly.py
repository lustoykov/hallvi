"""Runs once and exits. Removes receipts older than 30 days."""

import os
import time

RECEIPTS_DIR = os.environ.get("RECEIPTS_DIR", "/var/lib/shop/receipts")
MAX_AGE = 30 * 24 * 60 * 60

if __name__ == "__main__":
    os.makedirs(RECEIPTS_DIR, exist_ok=True)
    now = time.time()
    removed = 0
    for name in os.listdir(RECEIPTS_DIR):
        path = os.path.join(RECEIPTS_DIR, name)
        if os.path.isfile(path) and now - os.path.getmtime(path) > MAX_AGE:
            os.remove(path)
            removed += 1
    print(f"nightly tidy removed {removed} receipts", flush=True)
