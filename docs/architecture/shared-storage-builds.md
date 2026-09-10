# Shared storage and independent service builds

A service can use a published image, build its own source image, or reuse another service's image. Each build declares its repository-relative Dockerfile and context. Existing primary-service fields and image tags retain their meaning; companion builds receive distinct tags and are built before Compose starts any consumers. Source is transferred when any service builds, including when the primary service uses a published image.

A persistent volume is identified by its existing name. Several services may mount it at different paths, with read-only or read/write access per mount. The declarations agree on the data kind and relative SQLite path. `sharedVolumes` exposes the complete consumer list for storage facts and future consistency procedures. The storage view counts a shared volume once and shows its consumers and access. Release authorization retains all existing mounts and their access; it never drops a previous writer or silently makes an existing reader writable.

For example, a web service writes uploaded documents. An independently built worker reads those documents through a read-only mount and writes results to a second shared volume. The web service reads results through its own read-only mount. Both images can update while the named data survives.

The Docker proof in `release-docker.test.ts` exercises this arrangement alongside the previous single-build SQLite application: initial startup, seeded state, build failure, behavior-check failure with diagnostics, corrected update, distinct running images, retained SQLite data and worker results from the new revision. Real writes to read-only mounts fail. The fixture uses local Docker and a mapped SSH transport; it is not a live Hetzner deployment.

Unit tests also cover a published primary image with a source-built companion, sharing a companion's image, invalid image references, cycles, and contradictory shared-volume metadata. Existing plans retain their old volume and image identities. No application-name branches were added to deployment.

This does not promise arbitrary Compose import, multiple public ports, automatic file ownership repair, multi-host storage or generalized backup capture. Existing scheduled-backup implementations do not prove consistency for these new layouts: setup explicitly refuses shared/multi-build layouts rather than claiming coverage based on a familiar primary image. Backup support must account for every writer and state location before claiming protection.
