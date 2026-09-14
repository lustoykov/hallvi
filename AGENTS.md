# Development infrastructure

Before creating or modifying development infrastructure (Hetzner, worktrees,
branches, Docker resources, databases or temporary artifacts), read and follow
[the development resource lifecycle](docs/development-resources.md).

Label every temporary resource at creation, record its owning task/branch/worktree
outside the worktree, and renew its expiry while work continues. Clean up resources
owned by the task when finished, before removing its branch or worktree. Include
verified cleanup or explicitly retained resources in the final handoff. The daily
audit is a fallback for missed cleanup. These rules apply to development fixtures,
not user deployments made through the product.

Use the same durable ownership/expiry record for local resources. Preserve dirty
worktrees, unmerged work and uncertain data. Follow the lifecycle document's
resource-specific checks and legacy-resource classification before cleanup.
