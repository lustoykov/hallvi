"""Takes order ids off the Redis list, prices them, writes a receipt file."""

import os
import time

import psycopg
import redis

DATABASE_URL = os.environ["DATABASE_URL"]
REDIS_URL = os.environ["REDIS_URL"]
CURRENCY = os.environ.get("SHOP_CURRENCY", "EUR")
RECEIPTS_DIR = os.environ.get("RECEIPTS_DIR", "/var/lib/shop/receipts")


def price(item: str) -> int:
    """Deterministic, so a test can assert it: 100 cents per character."""
    return len(item) * 100


if __name__ == "__main__":
    os.makedirs(RECEIPTS_DIR, exist_ok=True)
    queue = redis.from_url(REDIS_URL)
    print("shop worker waiting on the orders list", flush=True)
    while True:
        taken = queue.blpop("orders", timeout=5)
        if not taken:
            time.sleep(0.1)
            continue
        order_id = int(taken[1])
        with psycopg.connect(DATABASE_URL) as connection:
            row = connection.execute(
                "select item from orders where id = %s", (order_id,)
            ).fetchone()
            if not row:
                continue
            cents = price(row[0])
            connection.execute(
                "update orders set cents = %s where id = %s", (cents, order_id)
            )
            connection.commit()
        with open(
            os.path.join(RECEIPTS_DIR, f"{order_id}.txt"), "w", encoding="utf8"
        ) as handle:
            handle.write(f"{row[0]} — {cents / 100:.2f} {CURRENCY}\n")
        print(f"priced order {order_id} at {cents} cents", flush=True)
