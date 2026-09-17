# GitHub connection

This is the GitHub connection and repository-access reference. Haldur reads repositories; it does not write to them or open pull requests. The [product boundary](../../PRODUCT.md#operating-boundary) limits any future application-code proposal to narrow operability changes the owner merges.

Repository access uses an explicitly chosen installation-wide connection; application records and repository evidence remain scoped to the application. Schema 14 retired the publication workflow and its per-application publishing grants; their records remain as read-only history, and branches or pull requests it opened on GitHub are left as they are.

## One GitHub App connection

Connect GitHub through Haldur's configured GitHub App device flow. Haldur stores the resulting user access/refresh tokens, expiries and connection identity in its own protected settings file. It does not discover, adopt or borrow `gh`, `GH_TOKEN` or `GITHUB_TOKEN` credentials. An older saved CLI selection is rejected with instructions to reconnect; Haldur does not sign the host CLI out or alter its account.

Legacy response fields are compatibility details, not a second supported login method. GitHub CLI credential adoption is retired.

## Register a local GitHub App once

This is deployment configuration, not something each person must do on every login.

1. Open [GitHub App registration](https://github.com/settings/apps/new). Use a recognizable name and the Haldur repository as the homepage.
2. Enable **Device Flow** and leave user-token expiration enabled. Device login does not need a redirect URI. Leave **Request user authorization during installation** disabled; Haldur initiates that separately.
3. Disable webhooks. Choose **Repository permissions → Contents → Read-only**. Metadata read access is mandatory; leave all other repository, account and organization permissions unset.
4. For a personal prototype, choose **Only on this account**. Broader distribution needs a deliberate change to this registration and a separate production security review.
5. Create the App. Copy its public **Client ID** and URL slug into `.env.local`:

   ```dotenv
   HALDUR_GITHUB_CLIENT_ID=your_public_client_id
   HALDUR_GITHUB_APP_SLUG=your-app-slug
   ```

6. Restart Haldur after editing environment configuration. Open Settings → GitHub, start sign-in, and enter the displayed code at GitHub. The page polls at GitHub's requested interval and slows down if told to.
7. Use **Choose repositories on GitHub** to install the App for **only selected repositories**. Sign-in identifies the user; installation grants repository access. Both are needed. Either may be completed first.
8. Add an application to check its repository. Reconnecting from Settings automatically checks existing applications. If you grant repository permissions after that check, open the application and choose **Check again** in its repository notice.

The device flow exchanges the public client ID and device code for a user access token; no App secret is required. Keep private keys/client secrets out of the distributed app, git and browser. A real installation and device sign-in were verified without generating either. GitHub's own [user access-token documentation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app) describes the supported flow and expiration.

## Automatic checks after reconnecting

After either login path succeeds in Settings, the page shows **Checking repository…** and sends a same-origin POST with the newly saved connection ID. Haldur checks each existing application's repository and shows the individual results with links back to the applications. This uses the GitHub adapter directly, not Pi or another model call.

The check runs once for the new connection; it does not repeat on every page load. Already-recorded attempts for that connection, including permission failures, are not automatically retried. **Check again** on the application page remains available after fixing access. Concurrent automatic requests share one in-process batch. A changed/disconnected login stops the batch, and late results cannot overwrite evidence for a replacement login. Application history is preserved.

This is a bounded request, not a durable background job: a server crash can interrupt it. If the browser cannot retrieve the result, it points to the application's manual retry. Changing installation permissions directly on GitHub does not trigger a webhook or a new check by itself.

## Exactly what a passing check proves

The adapter verifies, in order:

1. The saved connection is present, unexpired and not known invalid; a reused credential still matches the consented fingerprint.
2. `/user` returns the recorded numeric account ID.
3. Repository metadata matches the requested `owner/name`. Once an application has a recorded numeric repository ID, a new repository at the same URL cannot reuse its history.
4. For App login: the App installation is active, grants Contents read access, belongs to the repository owner, and lists the exact numeric repository ID among accessible repositories. Even public repository metadata alone is not enough.
5. The default branch resolves to an exact 40-character commit SHA, and the selected connection has not changed during the check.

The Observation stores account/repository IDs, connection ID, credential source, check time, commit and safe permission evidence. `grantedPermissions` describes the App installation; `accountRepositoryPermissions` describes the user's repository role, **not** the token's effective permission. For example, an owner may have `admin: true` while the App has only `contents: read`. CLI OAuth scopes are recorded separately and can be empty for tokens that do not use classic scopes. No token, device secret, raw provider error or CLI stderr is recorded.

Repository access counts only a passing Observation from the **currently selected connection ID**. Changing/disconnecting the connection, known revocation or expired access without usable renewal makes old evidence insufficient. Routine token rotation preserves the connection ID and its existing evidence; it is not a new consent or repository check. Reconnecting requires a new check; previous Observations and chats remain readable. This is an observed-at-time check, not continuous revocation monitoring: an upstream permission change is discovered on the next provider request.

## Storage, recovery and limits

- Own configuration: `.haldur/github-connection.json`, or `HALDUR_CONFIG_DIR/github-connection.json`. Writes are atomic with file mode `0600`. Access and refresh tokens are unencrypted at rest; do not expose this local prototype to the network or share its state directory. Neither token is included in browser data, evidence or provider-error messages.
- **Disconnect** cancels pending sign-in and replaces the owned file with `null`, removing both tokens and the selection from that file. A pending renewal cannot restore them. It does not erase disk backups, revoke authorization on GitHub, alter CLI credentials, or delete application history.
- Revoke upstream at [authorized GitHub Apps](https://github.com/settings/apps/authorizations); manage installed repository access at [installed GitHub Apps](https://github.com/settings/installations).
- User access tokens normally expire after eight hours. Haldur renews them on the next GitHub request, starting within one minute of expiry; there is no timer or background worker. [GitHub supports refreshing device-flow user tokens without a client secret](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens). The refresh token lasts six months and rotates when used. Reading Settings does not perform renewal; its “Access renews automatically” message means a usable local refresh token exists, not that remote authorization was just tested.
- Concurrent requests share one refresh exchange in the local Node process. Both tokens are validated and saved together before use. Late success or rejection cannot overwrite/invalidate a replacement login or a newer token; a repository request rejected because another request rotated its token retries once with the same connection's new token. Multiple server processes sharing this credential file are not supported: a future multi-process deployment needs cross-process coordination before sharing single-use refresh tokens.
- Temporary network/provider failures preserve the saved connection for retry. A rejected or expired refresh token requires sign-in; there is never a silent CLI/account fallback. If the provider rotates tokens but its response is lost, or saving fails, a subsequent attempt may also require sign-in because the old refresh token is single-use.
- Logins saved before automatic renewal was implemented need one new sign-in: their refresh token was not retained and cannot be recovered from the access token. They continue working until their existing access token expires. Legacy CLI selections require reconnecting through the App.
- Cancelled, denied, expired and interrupted device attempts have visible retry paths. Replacing a connection activates only after success; late completion cannot undo cancellation/disconnect/reuse. Attempts live in one Node process; a restart requires starting sign-in again.
- App permissions and the user's permissions intersect. Missing installation, missing Contents permission, an unselected/inaccessible private repository, or organization restrictions cannot become a passing check.

## Verification

`tests/application/integration/github-setup.test.ts` exercises the real coordinator, connection files, route boundary and repository adapter against synthetic provider responses. `tests/application/unit/github-api.test.ts` tests request/error handling without real tokens or network requests. `tests/browser/github.spec.ts` covers consent, device cancellation/denial/success, disconnect/reconnect, the application's repository notice and permission recovery with **Check again** in a disposable desktop app.

The browser fixture replaces only GitHub's API/credential boundary. The real GitHub setup routes, coordinator, domain code and SQLite run in the fixture. Pi and ChatGPT login use their existing synthetic adapters. CI never authorizes a real account. Earlier local/live evidence is recorded in the [archived acceptance guide](https://github.com/lustoykov/haldur/blob/0682ab257469bc5cee994572285283ea949bc3c6/docs/archive/implementation/phase-one-acceptance.md#latest-verification).

UI conventions for future changes live in the [shared settings design reference](../design/settings.md).
