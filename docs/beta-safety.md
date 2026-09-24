# Beta precautions

Hallvi can execute commands on your application server with the connected account's permissions. Incorrect actions or prompt injection through logs, repository content or other tool results can cause downtime, data loss or disclosure of data the tools can access. Broad security hardening is planned for after beta; these precautions are guidance, not a guarantee of protection.

- Use the most capable supported model available to you. No model is immune to prompt injection, and general intelligence alone does not establish security.
- Prefer a dedicated test server and non-sensitive data during beta. Keep unrelated systems and credentials outside its reach, and scope connected accounts to the resources you intend Hallvi to manage.
- Pi works on its copy of your repository on the computer running Hallvi, as your user account. Hallvi keeps its own credentials out of those commands, but they can reach whatever your account can. For software you don't trust, choose **In Docker** in Settings → Workspace; see [Hallvi's workspace](installation.md#hallvis-workspace).
- Use **Always ask** when you want to inspect commands before execution; the other two [permission modes](../PRODUCT.md#permission-modes) ask less. Review matters even for reads that could disclose private data.
- Keep tested recovery copies that the managed server and its credentials cannot delete. Backups help recovery; they cannot undo data theft. Avoid exposing sensitive production data unless you accept the current access risks.
