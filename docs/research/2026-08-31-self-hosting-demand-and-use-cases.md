# Self-hosting demand and use-case fit for Server Guy

> Dated research/reference, not an active requirement or implementation plan. Current scope is in [Product](../../PRODUCT.md) and delivery is in [Roadmap](../../ROADMAP.md). Recheck version-sensitive facts before use.

**Research date:** 2026-08-31  
**Scope:** Primary sources only: official analytics, first-party product reports and documentation, and GitHub repository metadata. “Direct evidence” below means a publisher-reported usage or activity count. GitHub stars are treated only as an interest proxy, not as users, installations, revenue, or willingness to pay.

## Summary

There is direct evidence of substantial self-hosting activity, but it spans different markets:

- Home Assistant reports hundreds of thousands of active opt-in installations, showing large-scale use of dedicated local home automation.
- Nextcloud reports millions of professional users added in 2025, showing demand for privately operated collaboration and data-sovereignty software, though not necessarily on hardware owned at home.
- TrueNAS reports tens of thousands of users running apps on their storage systems, with media, photo, file-sharing, networking, and download-automation apps among the most active.
- Coolify is the closest direct analogue to Server Guy: a self-hosted application PaaS for deploying sites, applications, databases, and packaged services to user-controlled servers.

These signals are not comparable enough to produce a defensible total market size. They also do not establish how many users experience enough operational pain to pay for Server Guy.

## Current adoption and interest signals

| Product | Primary-source signal | Evidence quality and limit |
|---|---|---|
| **Home Assistant** | [675,519 active installations](https://analytics.home-assistant.io/) on 2026-08-31. Home Assistant says analytics are opt-in and estimates that fewer than one quarter of users participate. | Direct active-installation evidence with a clearly disclosed undercount. The opt-in rate is not precise enough to extrapolate a total. |
| **Nextcloud** | Nextcloud says [more than two million new professionals began using it during 2025](https://nextcloud.com/blog/press_releases/sovereign-workspace-momentum/); it also reports that incoming leads tripled and bookings grew by more than 50% year over year. | First-party commercial and deployment claims. This includes on-premises, private-cloud, and trusted-provider deployments, so it is evidence for private operation, not specifically home hardware. |
| **Immich** | The official repository had [113,048 GitHub stars](https://api.github.com/repos/immich-app/immich) on 2026-08-31. | Strong developer/user interest proxy, but no comparable active-installation count is published in the reviewed official sources. |
| **Jellyfin** | The server repository had [56,390 GitHub stars](https://api.github.com/repos/jellyfin/jellyfin) on 2026-08-31. | Interest proxy only; not an installation or active-user count. |
| **Coolify** | Coolify’s maintainer documentation says it is [used by 400,000+ people worldwide](https://github.com/coollabsio/coolify/blob/main/CONTRIBUTING.md), and the repository had [61,232 GitHub stars](https://api.github.com/repos/coollabsio/coolify) on 2026-08-31. | The user count is a first-party claim without a published counting method. Its product shape—self-hosted PaaS on user-controlled servers—is the closest evidence of demand adjacent to Server Guy. |
| **CasaOS** | The repository had [37,169 GitHub stars](https://api.github.com/repos/IceWhaleTech/CasaOS) on 2026-08-31. Its official README supports NUCs, Raspberry Pis, old computers, and one-click apps such as Nextcloud, Home Assistant, AdGuard, Jellyfin, and the \*arr suite. | Interest and advertised workload breadth; no official active-installation count was found. |
| **Umbrel** | The repository had [11,813 GitHub stars](https://api.github.com/repos/getumbrel/umbrel) on 2026-08-31. Umbrel advertises [more than 300 apps](https://github.com/getumbrel/umbrel), including files, photos, personal AI, and Bitcoin-node workloads. | Interest and catalog breadth; not evidence that every advertised workload is widely installed. |
| **TrueNAS** | TrueNAS says it is [trusted by over one million users](https://www.truenas.com/download/). In April 2025 it reported [more than 80,000 TrueNAS 24.10 community members running at least one app](https://www.truenas.com/blog/truenas-apps-made-easy/), more than 50 apps active on at least 1,000 systems each, and its top ten apps above 10,000 active installations each. | First-party user and active-app counts. The app figures are a dated platform snapshot, not a current total for all TrueNAS versions. |

## What people self-host

### Direct evidence

The strongest workload evidence comes from installations rather than catalogs:

- **Home automation:** Home Assistant’s active-installation count directly establishes use of locally operated automation systems. Its official installation guidance recommends Home Assistant OS for most users and supports a more limited OCI container installation.
- **Private files and collaboration:** Nextcloud’s reported professional rollouts establish use of privately operated file sync, document collaboration, chat, video, email, contacts, and calendars.
- **Media, photos, files, networking, and download automation:** The [current TrueNAS Apps Market](https://apps.truenas.com/) identifies Tailscale, Jellyfin, Immich, Plex, Nextcloud, a generic container app, Sonarr, qBittorrent, Radarr, and Nginx Proxy Manager as its ten most active apps on 2026-08-31.
- **Developer application hosting:** Coolify explicitly supports [static sites, databases, full-stack applications, and 280+ one-click services](https://github.com/coollabsio/coolify). Its official installation documentation gives a production example containing Node.js apps, static sites, Plausible, Fider, Uptime Kuma, Ghost, Redis, and PostgreSQL.

### Advertised breadth, not proven usage

CasaOS and Umbrel show that home-server products compete on hardware reuse, one-click packaging, and broad app catalogs. Their catalogs include personal clouds, home automation, media, ad blocking, AI, Bitcoin, and many Docker applications. Without official active-installation data by workload, this is evidence of product supply and positioning—not enough to rank user demand.

## Product landscape

| Layer | Examples | Core promise | Relationship to Server Guy |
|---|---|---|---|
| Self-hosted application PaaS | Coolify | Deploy repositories, images, databases, and packaged services to owned servers. | Direct overlap with application deployment; strongest adjacent demand signal. |
| Home-server OS and app store | CasaOS, Umbrel | Turn common hardware into an approachable personal server with one-click apps. | Adjacent substitute. The product owns app packaging and much of the machine UX. |
| Storage platform with apps | TrueNAS | Manage disks, files, snapshots, and storage protocols, then run apps beside the data. | Mostly below Server Guy’s current application layer; could be a host integration boundary rather than an app target. |
| Vertically integrated self-hosted application | Home Assistant, Nextcloud, Immich, Jellyfin | Operate one domain-specific product while retaining control of hardware and data. | Candidate Application Profiles, but each carries domain-specific operational requirements. |

## Fit with Server Guy’s current contract

Server Guy currently defines an Application Contract for how software is built, configured, checked, observed, backed up, migrated, and verified. Its launch gates expect managed web/worker/database services, an immutable Release identity, persistence and restore evidence, logs, and external HTTPS verification ([domain model](../../CONTEXT.md), [launch gates](../user-journeys/01-application-launch.md)).

### Good fit

- **Custom web applications, APIs, static sites, and internal tools** packaged as OCI images, with bounded dependencies and an HTTP health/readiness contract.
- **Low-criticality personal or hobby web services** such as dashboards, monitoring, note/recipe tools, small Git services, and workflow applications when their persistence can be backed up and restored.
- **Developer staging and production workloads** whose desired state is a repository revision, image digest, configuration, database migration set, hostname, and verification suite.

These workloads map naturally to Release deployment, health checks, external observation, rollback, logs, and evidence. The machine can be a user-supplied Linux host or a provisioned VPS without changing the application-level contract.

### Conditional fit: requires an explicit Application Profile

- **Nextcloud:** Official Nextcloud AIO is a multi-container stack containing PostgreSQL, Redis, optional office/chat/search services, and Borg backup. It uses a master container to orchestrate the stack and has its own [backup and upgrade rules](https://github.com/nextcloud/all-in-one). Server Guy would need to treat the entire topology and its restore procedure as the Release, rather than treat one container as the application.
- **Immich:** Immich requires Docker Compose, at least 6 GB RAM, and recommends local SSD storage for PostgreSQL ([requirements](https://docs.immich.app/install/requirements/)). Its media library, database, thumbnails, and machine-learning cache create storage-capacity, consistency, and restore obligations beyond a generic database backup.
- **Jellyfin:** Jellyfin has an [official container deployment](https://jellyfin.org/docs/general/installation/container/), but DLNA requires host networking and efficient transcoding may require vendor-specific [GPU passthrough and acceleration](https://jellyfin.org/docs/general/post-install/transcoding/hardware-acceleration/). A Host Record would need explicit storage, network, and GPU capabilities.
- **Home Assistant Container:** The core application can run in an OCI runtime, but the container installation lacks Home Assistant apps; Bluetooth requires D-Bus access, and [Home Assistant OS remains the recommended installation](https://www.home-assistant.io/installation/linux). Supporting the expected full product would require appliance and hardware-device semantics, not only web application operations.

### Poor fit for the existing contract

- **NAS and file-server ownership:** SMB/NFS shares, raw disks, ZFS pools, RAID degradation, snapshots, permissions, disk replacement, and data scrubbing are infrastructure/storage operations below the current Application Contract. TrueNAS is closer to a host platform than an application Server Guy should deploy generically.
- **Network infrastructure:** DNS/ad blocking, VPN gateways, reverse proxies, and LAN discovery depend on privileged ports, routing, local-network identity, and failure modes that external HTTPS checks do not cover.
- **Hardware-coupled automation and surveillance:** USB, Zigbee, Bluetooth, cameras, GPU accelerators, and real-time local availability require device inventory and host-level recovery policies.
- **Non-HTTP or long-sync services:** Bitcoin nodes, peer-to-peer services, and many game servers need custom TCP/UDP ingress, protocol-specific health, large durable state, and potentially very long recovery. They do not fit an HTTPS-only public contract without extending it.
- **Workloads requiring high availability:** A single owned machine remains one physical and network failure domain. Server Guy can improve recovery and evidence, but the current single-host contract cannot provide continuity through host, power, or ISP failure.

“Hobby” does not imply “disposable”: a media service may tolerate downtime while its photo library is irreplaceable; home automation may be non-commercial while still controlling safety-relevant household functions. Availability criticality and data criticality must be modeled separately.

## Product implications

- The available primary sources support real demand for user-controlled application hosting and home infrastructure, but not one homogeneous self-hosting market.
- Coolify validates the closest surface to Server Guy’s existing contract. Home-server platforms validate adjacent interest but also show that one-click catalogs, storage management, hardware integration, and LAN networking are separate product capabilities.
- A provider-independent Host Contract can cover both existing Linux machines and provisioned VPSs for conventional web applications. Expanding into Nextcloud, Immich, Jellyfin, or Home Assistant would require explicit profiles and capability checks rather than weakening the common contract.
- The unresolved commercial question is not whether self-hosting exists; it is which segment has recurring operational pain, trusts an automated operator, and will pay for verified deployment and recovery. The reviewed primary sources do not answer that question or support a total market-size estimate.
