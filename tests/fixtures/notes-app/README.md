# Notes

A small notes service. `app.py` serves HTTP on port 8080 and stores notes in PostgreSQL: `GET /notes`, `POST /notes` with `{"body": "..."}`, `GET /version` and `GET /health`.

## Configuration

- `DATABASE_URL` (required): PostgreSQL connection URL, `postgresql://user:password@host:5432/database`.
- `APP_SECRET` (required): key that signs the digest returned with notes. Keep it private.

## Background worker (since v2)

`worker.py` counts the words of each note and stores them; `GET /notes` then reports them in `words`. Run it as a separate process from the same image with `python worker.py`. It needs `DATABASE_URL`, should start after PostgreSQL is ready, and serves no HTTP.

## Local development

`docker compose up` with the included `docker-compose.yml` starts a development database with throwaway credentials. Do not use it for deployments.
