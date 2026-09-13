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
must be treated as plaintext regardless of the encryption.

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

## What was done

- `.state/` and `.review/` added to `.gitignore`, `.prettierignore` and the
  ESLint ignores, and staged paths are checked before each commit.
- The paths were purged from every commit on the branch and force-pushed.
- **The exposed material was retired before the rig was relied on again** —
  see `.state/rotation.md` written by `scripts/rotate-rig-credentials.mjs`.

## What would have been different

Had any of it been real, rewriting history would not have helped: the fix
would have been revocation at the provider — a new SSH key pair with the old
public key removed from `authorized_keys`, a revoked GitHub installation
token, and rotated object-storage credentials — before anything else.

The lesson is cheaper than the incident: a runtime state directory is ignored
*before* it exists, not after it is committed.
