# Shared builds

A web service and a background worker, built independently from `web/` and `worker/`. Each directory has its own Dockerfile, and its `version.txt` names that component's release. Both images run as an unprivileged user.

## Web (`web/`)

`app.py` serves HTTP on port 8080:

- `GET /health`: liveness.
- `GET /version`: the web release.
- `GET /value`: the stored value.
- `POST /value` with `{"value": "..."}`: replaces the stored value and submits it to the worker as a job.
- `GET /result`: the worker's latest result, or `pending`.

The value is stored in the SQLite database `/data/application.sqlite`. A job is written to `/documents/job.txt`, and the result is read from `/results/job.txt`.

## Worker (`worker/`)

`worker.py` serves no HTTP. It reads the web service's documents at `/input` without modifying them, and writes `<value>@<worker release>` to `/output/job.txt`, which the web service reads as its results. It touches `/tmp/ready` after each pass.

## Persistent data

The database, the documents and the results are application state and must survive releases.
