# Shop

A small order service. Everything it needs is stated here; nothing about it
has to be guessed.

`app.py` serves HTTP on port 8000:

- `GET /health` → `{"ok": true}`
- `GET /orders` → the orders placed, newest first
- `POST /orders` with `{"item": "..."}` → places one and queues it for pricing
- `GET /receipts/<id>` → the receipt file written for an order, if there is one
- `GET /admin/summary` → totals; requires header `X-Admin-Password`

## Configuration

- `DATABASE_URL` (required): PostgreSQL, `postgresql://user:password@host:5432/database`.
- `REDIS_URL` (required): `redis://host:6379/0`. Orders are queued on the list `orders`.
- `SHOP_CURRENCY` (optional, default `EUR`): the currency code shown on receipts.
- `SHOP_ADMIN_PASSWORD` (required): the value `X-Admin-Password` is compared against. It is a secret; do not put it in the repository, in a compose file committed anywhere, or in any log.
- `RECEIPTS_DIR` (optional, default `/var/lib/shop/receipts`): where receipt files are written. Its contents must survive the container being replaced.

## Processes

Three, from the same image:

- `python app.py` — the web process. Port 8000.
- `python worker.py` — takes order ids from the `orders` list in Redis, prices them and writes a receipt file into `RECEIPTS_DIR`. Serves no HTTP.
- `python nightly.py` — runs once and exits: deletes receipts older than 30 days and prints how many it removed. Intended to run daily, and safe to run at any time.

## Local development

`docker compose up` starts PostgreSQL and Redis with throwaway credentials on
published ports. It is for development only and not a deployment.
