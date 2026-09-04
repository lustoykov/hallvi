# GitHub connection

Server Guy reads repositories through an explicitly chosen, installation-wide connection. Application records and repository-check evidence remain application-scoped. This milestone is read-only: no pushes, pull requests, workflow changes, or deployment writes.

## Two login paths

| Choice in Settings → GitHub | What is real | What Server Guy saves |
| --- | --- | --- |
| Use existing login | The server's `GH_TOKEN`, then `GITHUB_TOKEN`, then `gh auth token --hostname github.com`, in that precedence order. A read-only `/user` request identifies it automatically. | Account ID/login, credential source, token fingerprint, connection ID and consent time. The token is not copied. |
| Connect another account | GitHub App device login. The same GitHub account may be used; this is a separate Server Guy authorization. | The user access token, its expiry, account identity and connection ID. No refresh token, App private key or client secret. |

Detection does not activate a connection. Existing machine credentials can have broader permissions than Server Guy needs; their reuse is an explicit choice. If their token/source changes, choose the login again. Server Guy never signs the CLI in/out or changes its active account.

## Register a local GitHub App once

This is deployment configuration, not something each person must do on every login.

1. Open [GitHub App registration](https://github.com/settings/apps/new). Use a recognizable name and the Server Guy repository as the homepage.
2. Enable **Device Flow** and leave user-token expiration enabled. Device login does not need a redirect URI. Leave **Request user authorization during installation** disabled; Server Guy initiates that separately.
3. Disable webhooks. Choose **Repository permissions → Contents → Read-only**. Metadata read access is mandatory; leave all other repository, account and organization permissions unset.
4. For a personal prototype, choose **Only on this account**. Broader distribution needs a deliberate change to this registration and a separate production security review.
5. Create the App. Copy its public **Client ID** and URL slug into `.env.local`:

   ```dotenv
   SERVER_GUY_GITHUB_CLIENT_ID=your_public_client_id
   SERVER_GUY_GITHUB_APP_SLUG=your-app-slug
   ```

6. Restart Server Guy after editing environment configuration. Open Settings → GitHub, start sign-in, and enter the displayed code at GitHub. The page polls at GitHub's requested interval and slows down if told to.
7. Use **Choose repositories on GitHub** to install the App for **only selected repositories**. Sign-in identifies the user; installation grants repository access. Both are needed. Either may be completed first.
8. Add an application, or open its repository check and choose **Re-run repository check**.

The device flow exchanges the public client ID and device code for a user access token; no App secret is required. Keep private keys/client secrets out of the distributed app, git and browser. A real installation and device sign-in were verified without generating either. GitHub's own [user access-token documentation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app) describes the supported flow and expiration.

## Exactly what a passing check proves

The adapter verifies, in order:

1. The saved connection is present, unexpired and not known invalid; a reused credential still matches the consented fingerprint.
2. `/user` returns the recorded numeric account ID.
3. Repository metadata matches the requested `owner/name`. Once an application has a recorded numeric repository ID, a new repository at the same URL cannot reuse its history.
4. For App login: the App installation is active, grants Contents read access, belongs to the repository owner, and lists the exact numeric repository ID among accessible repositories. Even public repository metadata alone is not enough.
5. The default branch resolves to an exact 40-character commit SHA, and the selected connection has not changed during the check.

The Observation stores account/repository IDs, connection ID, credential source, check time, commit and safe permission evidence. `grantedPermissions` describes the App installation; `accountRepositoryPermissions` describes the user's repository role, **not** the token's effective permission. For example, an owner may have `admin: true` while the App has only `contents: read`. CLI OAuth scopes are recorded separately and can be empty for tokens that do not use classic scopes. No token, device secret, raw provider error or CLI stderr is recorded.

The gate requires a passing Observation from the **currently selected connection ID**. Changing/disconnecting the connection, known revocation or local expiry makes old evidence insufficient. Reconnecting requires a new check; previous Observations and chats remain readable. This is an observed-at-time check, not continuous revocation monitoring: an upstream permission change is discovered on the next provider request.

## Storage, recovery and limits

- Own configuration: `.server-guy/github-connection.json`, or `SERVER_GUY_CONFIG_DIR/github-connection.json`. Writes are atomic with file mode `0600`. User access tokens are unencrypted at rest; do not expose this local prototype to the network or share its state directory.
- **Disconnect** cancels pending sign-in and replaces the owned file with `null`, removing the current token/selection from that file. It does not erase disk backups, revoke authorization on GitHub, alter CLI credentials, or delete application history.
- Revoke upstream at [authorized GitHub Apps](https://github.com/settings/apps/authorizations); manage installed repository access at [installed GitHub Apps](https://github.com/settings/installations).
- User tokens normally expire after eight hours. This prototype requires sign-in again; automatic refresh needs a client secret and is deliberately not implemented or shipped. Expired credentials never silently fall back to the CLI or another account.
- Cancelled, denied, expired and interrupted device attempts have visible retry paths. Replacing a connection activates only after success; late completion cannot undo cancellation/disconnect/reuse. Attempts live in one Node process; a restart requires starting sign-in again.
- App permissions and the user's permissions intersect. Missing installation, missing Contents permission, an unselected/inaccessible private repository, or organization restrictions cannot become a passing check.

## Verification

`tests/application/integration/github-setup.test.ts` exercises the real coordinator, connection files, route boundary and repository adapter against synthetic provider responses. `tests/application/unit/github-api.test.ts` tests request/error handling without real tokens or network requests. `tests/browser/github.spec.ts` covers consent, device cancellation/denial/success, disconnect/reconnect, exact saved evidence and permission recovery in a disposable desktop app.

The browser fixture replaces only GitHub's API/credential boundary. The real GitHub setup routes, coordinator, domain code and SQLite run in the fixture. Pi and ChatGPT login use their existing synthetic adapters. CI never authorizes a real account. Current local/live evidence is recorded in the [Phase 1 acceptance guide](../testing/phase-one-acceptance.md#latest-verification).

UI conventions for future changes live in the [shared settings design reference](../architecture/settings/DESIGN.md).
