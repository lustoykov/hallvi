# Traffic history: the collection experiment

29 September 2026, 15:39–16:12 UTC. Branch `claude/traffic-v1-collector`,
collector at `d60f0cfb`. The integration branch was merged in at 15:52 and
16:02, and the worker restarts after that ran the merged code. Neither merge
touched the collector or the modules it drives. This is Proof #1 of
[the traffic design](../design/traffic.md#proof): stored totals equal an
independent count of the raw files, restarts change nothing, a deleted file
reads as a gap, and a lost connection recovers with exact numbers.

## What ran

Everything ran locally in a disposable Compose project on 127.0.0.1, torn
down afterwards (`docker compose down -v`).

- **proxy:** `caddy:2` (v2.11.4), set up as
  [Setting up the log](../design/traffic.md#setting-up-the-log) describes. A
  `log hallvi` of its own writes `/var/log/caddy/hallvi/access.log`. It has
  `roll_keep 1000`, `roll_keep_for 30d`, `mode 0640` and `dir_mode 0755`, a
  `format filter` that removes the query string from `request>uri` and
  `Referer`, and `log_append hv_<key>` for the kept keys. Two values were
  changed from the design so that the log rotated during the run:
  `roll_size 1MiB` and `roll_interval 1m`. The proxy serves `/_hv/s.js` and
  answers `/_hv/e/*` with 204. A second site, `other.localhost`, writes to
  the same log.
- **app:** a second `caddy:2` that answers pages as HTML, `/api/*` as JSON
  and `/boom` with 500.
- **sshd:** `ubuntu:24.04` running OpenSSH 9.6. The log directory is a named
  volume shared with the proxy. Hallvi's SSH user is root, with a throwaway
  key and a pinned host key.
- **Hallvi:** the real worker (`node --import tsx src/worker.ts`) with a
  fresh state directory (`HALLVI_DB_PATH`, `HALLVI_CONFIG_DIR`,
  `HALLVI_PI_CONFIG_DIR` and `HALLVI_LOG_DIR` in a scratch directory). The
  application's server is the sshd. Its `access-log` record is
  `{proxy:"Caddy", format:"caddy-json", source:{type:"file",
  path:"/var/log/caddy/hallvi/access.log"}, hosts:["shop.localhost"]}`, and
  "Keep traffic history" is on. `TZ=Asia/Singapore` put local midnight at
  16:00 UTC, so the run crossed a day boundary and a day close.
- **Traffic:** a generator sent real HTTP requests through the proxy. One
  unit is three browser page loads (`Sec-Fetch-Dest: document`), one API
  call, one 500, one Googlebot page, one probe for `/.env`, one request to
  the other host and one "Hallvi access check". Batches marked *events* then
  also send the script's `view`, `ping`, `goal`, `leave` and `error` events
  from browsers. The traffic comes from five addresses (via
  `X-Forwarded-For`, trusted from private ranges) and two agents.
- **Independent count:**
  `ssh … 'cd /var/log/caddy/hallvi && gzip -cdf access*'` piped into a
  60-line script that shares nothing with Hallvi's readers or counting. The
  script counts per local day:
  - requests: every `shop.localhost` line except Hallvi's check and `/_hv/`;
  - errors: 5xx;
  - bots: Googlebot or a path starting `/.`;
  - views: document GETs answered 200 or 304 before the first script
    event, plus the script's `view` events;
  - goals, script errors and `leave` samples, from the event payloads.

  `wc -l` and `grep -c` on the same stream checked the line, 5xx and event
  totals. The fixtures worker's `traffic-fixture.ts verify` also ran on a
  copy of the final files. It agrees on errors (330 and 45), events (500 and
  175) and, less the other host, on requests. It does not filter by host,
  count the switch point or name bots it did not generate, so it is not the
  comparison below.

## Numbers

The stored figures are the day rows in `traffic.db`. Each figure matched the
independent count, and the comparison printed `EXACT` at every step.

| Step (UTC) | What happened | Stored for 2026-09-29 (requests / views / errors / bots / goals / script errors / leaves) | Independent count |
| --- | --- | --- | --- |
| 15:42 | Collection on, worker started, 40 units sent while it followed | 281 / 120 / 40 / 80 / 0 / 0 / 0, state `live` | same |
| 15:43–15:46 | **Worker stopped.** 100 units, 100 units with events, 20 units. The log rolled four times: three `time` rotations and one `size` rotation | (nothing written while off) | 2,841 lines, 260 × 5xx, 500 events |
| 15:46 | Restart | 1,821 / 820 / 260 / 520 / 100 / 100 / 100, `viewSource: switch`, switch point 15:45:21.844 | same |
| 15:47 | Restart 2 | 1,821 / 820 / 260 / 520 / 100 / 100 / 100 | same |
| 15:47 | Restart 3 | 1,821 / 820 / 260 / 520 / 100 / 100 / 100 | same |
| 15:47 | SSH session killed on the server (`pkill -KILL -f "sshd: root@"`) | state `lost`: "Connection to 127.0.0.1 closed by remote host." | — |
| 15:48 | 30 units sent during the loss, and reconnected after 5 s | 2,031 / 820 / 290 / 580 / 100 / 100 / 100, state `live` | same |
| 15:48 | **Worker stopped**, oldest rotated file deleted, worker restarted | 2,030 / 820 / 290 / 580 / … (the file held one line) | same |
| 15:49 | **Worker stopped**, the next oldest file (all of the first batch) deleted, worker restarted | 1,750 / 700 / 250 / 500 / 100 / 100 / 100. Coverage starts at 15:44:02.018; gaps `not-collecting` to 15:42:29.084 (collection turned on), then `log-rotated` 15:42:29.084–15:44:02.018 | same |
| 15:56 | 20 units, page loads only (the script silent) | 1,890 / 700 / 270 / 540 / …; `scriptSilentSince` 15:46:24.257 | same |
| 15:59:46 → 16:00:10 | 60 units just before local midnight, then 30 units with events just after, while the worker followed | 29th: 2,310 / 700 / 330 / 660 / 100 / 100 / 100. 30th: 210 / 30 / 30 / 60 / 30 / 30 / 30, `viewSource: script`. Silence cleared | same, split at midnight |
| 16:10:00.735 | Day close: the 29th counted again from the files | 29th `final: true`, same numbers, coverage to 16:00:00.000 | same |
| 16:10 | Restart after the close | the 29th untouched (`computedAt` still 16:10:00.735), and the 30th counted again from the log with the same numbers | same |
| 16:11 | Collection off | the follow's SSH session gone on the server within 3 s, state `off` | — |
| 16:11 | 10 units sent while off, then collection back on | 30th: 315 / 35 / 45 / 90 / 35 / 35 / 35. The follow started again and counted the traffic sent while off | same |
| 16:12 | `access-log` record retired | the follow ended, state `no-log` | — |

The day's estimated visitors stayed at 10 throughout: five addresses times
two agents.

## What else was seen

- The follow crossed four rotations live: `tail -F` moved to each new file.
  Nothing was lost or counted twice (the 15:42 row).
- One run (`hv.sh live`) put the live stream's parts on the same sshd:
  `followAccessLog` with the record's format and hosts, and `LiveWindow`
  shaping each line. It saw 475 requests, 190 bots and 30 views as arrivals.
  A script view came through as
  `{kind:"view", path:"/app/1", country:"CN", source:"news.example",
  device:"mobile", visitor:"82a7923f4e"}`, with no address and no agent.
  With `recentVisitors: 5`, the last five minutes held the five browsers of
  the newest batch. `openNow: 0`, because every ping was more than a minute
  old.
- The worker log held nothing but "Pi worker ready."

## Limits

- **A recount of today can lose what was already counted.** "Today is
  recounted from the log whenever the collector starts or reconnects," so
  the 15:49 deletion took the first batch out of today's totals after it
  had been counted live. What is left is a named `log-rotated` gap, not
  zeros. A *finished* day keeps what was counted where the log no longer
  answers for it (the review fixes below compare the stretches each count
  covers, hour by hour). That path was not exercised here; it has unit
  tests.
- The first deleted stretch straddled the moment collection was turned on.
  The part before it reads `not-collecting` ("history was not being kept")
  and the part after it reads `log-rotated`.
- The run did not exercise:
  - a proxy other than Caddy, or a container source;
  - a user without root or sudo, or an unreadable file;
  - backfill of more than one finished day, and the switch point moving
    earlier across days;
  - a day that changes the clocks.

  The readers and the counting have their own tests for those.
- `roll_interval 1m` and `roll_size 1MiB` are far below the design's 24 h
  and 100 MiB. Caddy rolls lazily, on the first write after the interval, so
  a rotated file's name is the moment of that write.

## Review fixes, re-checked on a real server

29 September 2026, 18:29 and 18:33 UTC, after the Codex review of PR #259
(branch `claude/traffic-v1-fix-collector`). A disposable Compose project on
127.0.0.1 ran `ubuntu:24.04` with OpenSSH 9.6p1, bash 5.2.21 and sudo
1.9.15p5, torn down afterwards. `/var/log/caddy/hallvi` was `root:adm 0750`
and its files `root:adm 0640`. User `hv` has passwordless sudo and is not in
`adm`; user `nosudo` has neither. A script on the controller called
`listLog`, `followLog` and `followAccessLog` over real SSH:

- As `hv`, the listing ran itself again through `sudo -n` and gave each file
  its inode.
- The file being written was rolled after the listing and before the follow.
  The follow read the rotated file, then said `hallvi-moved access.log` and
  exited 5 before `tail` opened the new file.
- Listed again, with the rotated `.gz` cut short, the follow read the rolled
  file and the new one, said `hallvi-unreadable` for the `.gz`, and followed
  a line appended afterwards.
- The live stream as `hv` announced live, sent the last lines, and followed
  an appended line through `sudo -n tail`.
- After each abort, `pgrep tail` found nothing on the server.
- As `nosudo`, the live stream ended with
  "/var/log/caddy/hallvi/ is not readable by nosudo." (exit 4).

The day's close, the interval rule and the worker's independent ticks have
tests of their own (`traffic-day-close`, `traffic-collector`,
`pi-worker-traffic`). The full collection run above was not repeated.
