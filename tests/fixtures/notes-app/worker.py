import os
import time
import urllib.parse
from pathlib import Path

import pg8000.native

URL = urllib.parse.urlparse(os.environ["DATABASE_URL"])


def connect():
    for _ in range(60):
        try:
            return pg8000.native.Connection(
                user=urllib.parse.unquote(URL.username or ""),
                password=urllib.parse.unquote(URL.password or ""),
                host=URL.hostname,
                port=URL.port or 5432,
                database=URL.path.lstrip("/"),
            )
        except Exception:
            time.sleep(1)
    raise SystemExit("PostgreSQL is unreachable at DATABASE_URL.")


while True:
    connection = connect()
    connection.run(
        "UPDATE notes SET words = array_length(regexp_split_to_array(trim(body), '\\s+'), 1) WHERE words IS NULL"
    )
    connection.close()
    Path("/tmp/worker-ready").touch()
    time.sleep(2)
