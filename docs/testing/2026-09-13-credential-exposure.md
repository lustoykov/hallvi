# The runtime state that reached a commit, and how it was classified

On 13 September 2026 a UX branch committed its local runtime directory —
461 files — because `.state/` had not been added to `.gitignore` before the
first commit. This records what was in it, how each item was classified as rig
or real **without printing any value**, and what was done about it.

The branch history was rewritten and force-pushed, and the repository is
private. Neither of those revokes anything, which is why the classification
below is the part that mattered.

## What was committed

| Path | Kind |
| --- | --- |
| `operator/<app>/ssh/id_ed25519` × 3 | SSH private keys |
| `secrets/key` | The AES-256-GCM key for the secret store |
| `secrets/<app>.json` × 2 | The ciphertexts that key decrypts |
| `github-connection.json` | A GitHub connection with a `token` field |
| `server-guy.db` + `-wal`/`-shm`, `diagnostics/`, `pi-workspaces/` | Conversations, executions, saved records |
| `pi-settings.json` | Model and auth-path settings, no credential |

Because the key and the ciphertexts travelled together, the five secret values
must be treated as plaintext regardless of the encryption. This is not a
theoretical reading: see [What a new key does not do](#what-a-new-key-does-not-do)
below, where all five were decrypted from the pushed material alone.

## How each was classified

The rule was to identify the **system a credential authorises**, never to read
the credential. Every command below prints names, lengths and identifiers only.

**SSH keys — which host do they reach?** The application's stored host
configuration names the address, and the rig's stand-in rewrites it:

```bash
sqlite3 -noheader .state/server-guy.db \
  "select json_extract(host,'\$.address')||' port '||json_extract(host,'\$.port') from applications;"
# 192.0.2.10 port 22   (×3)
```

`192.0.2.10` is the rig's documented host-container address, reached through
`SG_RIG_SSH_PORT=2224` on loopback by `tests/rig/bin/ssh`; the stored
`providerConnectionId` is `audit-local-provider`. No key reaches a real host.
Confirmed by the shim being on `PATH` for every process that used those keys.

**The GitHub token — which app, which account?** Read the non-secret
identifiers beside it and the token's *length and prefix only*:

```python
d = json.load(open(".state/github-connection.json"))
print(d["mode"], d["clientId"], d["slug"], d["account"], len(d["token"]), d["token"][:4])
# app  Iv1.rig  rig-server-guy  {'id': 42, 'login': 'rig-owner'}  17  ghu_
```

`Iv1.rig` / `rig-server-guy` / `rig-owner` are the rig stand-in's fixtures, set
by `SERVER_GUY_GITHUB_CLIENT_ID=Iv1.rig` in `tests/rig/rig.mjs`. A real GitHub
user-to-server token is far longer than 17 characters. The value is fabricated;
nothing on GitHub was exposed.

**The secrets — what do they unlock?** Names only, never values:

```python
for p in glob(".state/secrets/*.json"):
    print([i["name"] for i in json.load(open(p))])
# ['SHOP_ADMIN_PASSWORD', 'POSTGRES_PASSWORD', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']
# ['GF_SECURITY_ADMIN_PASSWORD']
```

All five were supplied during the #65 rig work to containers inside
`sg-rig-views`. The `AWS_*` pair is the rig's MinIO stand-in, which serves
`https://s3.rig.amazonaws.com` from inside the container — not AWS.

**What was *not* committed.** Searched history by path rather than by content:

```bash
git log --all --name-only --pretty=format: | grep -i -e '\.env\.local' -e hetzner-connection
# no matches
```

`.env.local` is a gitignored symlink to the developer's own file, so the real
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` never entered the
repository. No Hetzner connection file was present in the copied state; the
rig fakes the provider.

## Conclusion

**Nothing that authorises an external system was exposed**, so there was
nothing at a provider to revoke. Everything reached a local throwaway
container or was fabricated by the rig's stand-ins.

## What a new key does not do

An earlier version of this document said that writing a new secret-store key
"makes the pushed ciphertexts undecryptable". **That was wrong, and it is the
kind of wrong that would have stopped the real work from happening.**

The key and the ciphertexts were pushed *together*. Writing a new key changes
what the controller will use for values written from now on. It cannot reach
back into the pushed objects, and the old key sitting next to the old
ciphertext still decrypts it. Nothing done inside this repository can make
already-published bytes unreadable.

Demonstrated rather than asserted. The pre-rewrite commit is still in the
local object store under `refs/original`, which is exactly the position anyone
with a copy of the pushed branch is in:

```bash
git show 'c9d7348^:.state/secrets/key'                    > key
git show 'c9d7348^:.state/secrets/<application>.json'     > sealed.json
# then aes-256-gcm, iv:tag:body base64, as src/server/application-secrets.ts seals it
```

```
SHOP_ADMIN_PASSWORD        — DECRYPTED, 36 characters recovered
POSTGRES_PASSWORD          — DECRYPTED, 34 characters recovered
AWS_ACCESS_KEY_ID          — DECRYPTED, 19 characters recovered
AWS_SECRET_ACCESS_KEY      — DECRYPTED, 48 characters recovered
GF_SECURITY_ADMIN_PASSWORD — DECRYPTED, 30 characters recovered
```

Five of five, using only material that was pushed. The recovered plaintext was
then used for the one thing it is good for: proving each value no longer opens
anything.

## Two different acts, which this document previously confused

Clearing the controller's stored value and changing what the target service
accepts are separate, and only the second one is rotation:

- **Clearing the stored value** stops *this controller* from replaying the
  value into a future command. It is bookkeeping on our side. The service
  still accepts the old value, and anyone holding the pushed material still
  has it.
- **Changing what the service accepts** is the act that matters. Until it
  happens, the exposed value is live.

Per credential, as of 13 September 2026:

| Credential | Controller's stored value | What the service accepts | Exposed value, probed after |
| --- | --- | --- | --- |
| `POSTGRES_PASSWORD` | cleared; request re-raised | `ALTER USER shop PASSWORD` on `shop-…-db-1` | **rejected** — `psql` from another container over `shop-…_backend` |
| `SHOP_ADMIN_PASSWORD` | cleared; request re-raised | `/etc/shop/admin.env` rewritten, `web` recreated | **rejected** — `/admin/summary` went 200 → 401 |
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | cleared; request re-raised | `rig-minio` recreated with a new root pair; `/etc/shop/backup.env` rewritten | **rejected** — `mc ls` over `https://127.0.0.1:9000`; the `server-guy-backups` bucket is intact |
| `GF_SECURITY_ADMIN_PASSWORD` | cleared; request re-raised | `grafana cli admin reset-admin-password` | **rejected** — `/api/org` returns 401 |
| 3 × operator SSH private keys | replaced in `.state/operator/…` and at the paths the applications reference; the exposed pair kept as `.exposed` | the exposed public keys removed from `authorized_keys` in `sg-rig-views` | **rejected** — none of the three exposed public keys appears in the file; all three applications still connect |

Every "rejected" above was measured with the plaintext recovered from the
pushed material, not with a value assumed to be equivalent.

### Two caveats, recorded rather than smoothed over

- **Grafana has no clean baseline.** A first rotation attempt succeeded before
  I had measured whether the exposed password worked, so the "before" reading
  for Grafana was already taken after the change. What is established is the
  end state: the exposed value returns 401 and the replacement returns 200. It
  is *not* established by measurement that the exposed value ever worked,
  though there is no reason to think it did not.
- **A trust path made the first Postgres probe meaningless.** `pg_hba.conf` in
  that container has `local` and `127.0.0.1` on `trust`, so both the old and
  the new password "authenticated" when probed from inside the container — the
  password was not being checked at all. Only `host all all all scram-sha-256`
  checks one, so the probe was redone from a separate container over the
  compose network. A verification that cannot fail is not a verification.

## What was done

- `.state/` and `.review/` added to `.gitignore`, `.prettierignore` and the
  ESLint ignores, and staged paths are checked before each commit.
- The paths were purged from every commit on the branch and force-pushed —
  which, again, revokes nothing. The local `refs/original` above is the proof.
- **Every exposed credential was retired at the service that honoured it**, as
  the table records, and each was re-probed afterwards with its own recovered
  plaintext.
- `scripts/rotate-rig-credentials.mjs` previously wrote
  `authorized_keys` wholesale. That is not rotation; it is a lockout, and it
  removed the authorisation of three applications whose controllers held their
  keys at paths outside `.state/`. It now removes exactly the public keys being
  retired, adds their replacements, and preserves every other authorised line.

### Left unchanged, explicitly

- **The pushed material itself.** The old key and the old ciphertexts remain
  readable to anyone who took a copy of the branch before the rewrite. Nothing
  can change that; it is why the services were changed instead.
- **`.exposed` copies of the three SSH private keys** are still on this
  machine beside their replacements, kept so the negative test above can be
  repeated. They open nothing.
- **The rig's GitHub connection token** was not rotated, because it is a
  fabricated 17-character fixture belonging to the rig's own stand-in
  (`Iv1.rig` / `rig-server-guy` / `rig-owner`), not a credential any service
  honours. Nothing to rotate.

## What would have been different

Had any of it been real, the shape of the work would have been the same as
what the table above records — change what each service accepts, then prove the
old value is refused — but at a provider rather than in a container, and with
no option to take the measurement at leisure. Rewriting history would have
contributed nothing, exactly as it contributed nothing here.

The lesson is cheaper than the incident: a runtime state directory is ignored
*before* it exists, not after it is committed.
