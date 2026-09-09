# Cloudflare, Hetzner, and EC2 hosting costs for Server Guy

> Dated research/reference, not an active requirement or implementation plan. Current scope is in [Product](../../PRODUCT.md) and delivery is in [Roadmap](../../ROADMAP.md). Recheck version-sensitive facts before use.

**Research date:** 2026-09-04. Primary sources only. Prices exclude taxes; currencies remain as published, with no assumed exchange rate. These are infrastructure estimates, excluding Server Guy fees and model API usage.

## Always-on Linux VM comparison

Assumptions: one newly ordered server, one public IPv4, a full month, low-to-moderate CPU usage, no paid traffic overage. AWS uses 730 instance-hours, 40 GiB gp3 at its included IOPS/throughput, Linux On-Demand shared tenancy, and no promotional credits or commitments. Hetzner uses its monthly cap in Germany/Finland. This is a resource-shape comparison, not a performance benchmark.

| Configuration | VM | Storage | IPv4 | Base monthly total | Backup addition |
|---|---:|---:|---:|---:|---:|
| Hetzner CX23, 2 vCPU / 4 GB RAM / 40 GB local NVMe | €5.49 | Included | €0.50 | **€5.99** | +€1.098 → **€7.09** rounded total |
| Hetzner CX33, 4 vCPU / 8 GB RAM / 80 GB local NVMe | €8.49 | Included | €0.50 | **€8.99** | +€1.698 → **€10.69** rounded total |
| AWS t3a.medium, Frankfurt, 2 vCPU / 4 GiB RAM | $31.536 | $3.808 | $3.65 | **$38.99** rounded | $0.054 per GB-month of stored standard EBS snapshots |
| AWS t3.medium, Frankfurt, 2 vCPU / 4 GiB RAM | $35.04 | $3.808 | $3.65 | **$42.50** rounded | Same snapshot rate |

Hetzner new-order rates changed on June 15, 2026. Use the [current price-adjustment table](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/#cloud-servers), not older search snippets. Specs are on the [Cost-Optimized product page](https://www.hetzner.com/cloud/cost-optimized/). [Primary IPv4 costs €0.50/month](https://docs.hetzner.com/general/infrastructure-and-availability/ipv4-pricing/). The [billing FAQ](https://docs.hetzner.com/cloud/billing/faq/) prices seven backup slots at 20% of the server price; IPv4 is billed separately.

AWS Frankfurt rates were read from AWS's own public price datasets, whose EC2/EBS publication timestamp was `2026-09-03T19:52:06Z`:

- [EC2 price dataset](https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/ec2/USD/current/ec2.json): `regions["EU (Frankfurt)"]` contains `OnDemand Linux-instancetype-t3a.medium` at **$0.0432/hour** and `OnDemand Linux-instancetype-t3.medium` at **$0.048/hour**.
- [EBS price dataset](https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/ec2/USD/current/ebs.json): same region contains `Storage General Purpose gp3 GB Mo` at **$0.0952/GB-month** and `Storage Snapshot Amazon S3 GB Mo` at **$0.054/GB-month**. [EBS pricing](https://aws.amazon.com/ebs/pricing/) confirms units, included gp3 performance, and incremental snapshot billing.
- [VPC pricing](https://aws.amazon.com/vpc/pricing/): public IPv4 is **$0.005/hour**, including allocated idle addresses.

Calculation: `730 × hourly VM rate + 40 × 0.0952 + 730 × 0.005`. The t3a result is $38.994 before rounding. One 40 GiB worth of stored snapshot data adds $2.16/month; seven restore points do not necessarily store seven full copies because standard EBS snapshots are incremental. Backup cost depends on used blocks, changes, and retention.

## Traffic, performance, and operational limits

Hetzner's EU plans above include **20 TB outgoing traffic**. Incoming/internal traffic is free under its [billing definitions](https://docs.hetzner.com/cloud/billing/faq/). AWS has **100 GB internet egress free per month, aggregated across services and regions**, with stated exclusions; see [EC2 pricing](https://aws.amazon.com/ec2/pricing/on-demand/). Frankfurt's next-10-TB internet egress rate is **$0.09/GB** in the [AWS data-transfer dataset](https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/datatransfer/USD/current/datatransfer.json), key `DataTransfer External Outbound Next 10 TB` in `EU (Frankfurt)`. Thus 1,000 billed-unit GB/month, with the entire 100 GB allowance available, adds **$81** to AWS. This excludes transfer paths with different pricing.

Hetzner markets CX as shared, cost-optimized capacity for low-to-medium CPU usage and warns that supply is limited; its [product page](https://www.hetzner.com/cloud/cost-optimized/) does not establish capacity available in the user's account. Confirm the SKU/location when preparing a launch quote. Two shared vCPUs do not promise two continuously dedicated cores.

AWS [T3/T3a specifications](https://aws.amazon.com/ec2/instance-types/t3/) give these medium instances two vCPUs and 4 GiB RAM. Their [CPU-credit baseline](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-credits-baseline-concepts.html) is 20% per vCPU, earning 24 credits/hour. Sustained usage above baseline can add [Unlimited CPU-credit charges](https://aws.amazon.com/ec2/pricing/on-demand/#T2/T3/T4g_Unlimited_Mode_Pricing); Standard mode instead limits performance when credits run out. Base figures above exclude surplus CPU charges, load balancers, NAT gateways, managed databases, paid logs, and cross-zone/region transfers.

Hetzner [daily backups](https://docs.hetzner.com/cloud/servers/backups-snapshots/overview/) cover the server disk, keep seven slots, and exclude attached Volumes. Snapshot/backup presence alone does not verify application-consistent database recovery.

## Cloudflare: cost depends on the execution model

A VPS gives the operator a virtual machine and a persistent system disk. Cloudflare Workers executes request/event handlers in its managed runtime; Cloudflare Containers runs container images with a Worker and Durable Object managing routing and lifecycle. These are different operating contracts, not interchangeable instance sizes. [Containers architecture](https://developers.cloudflare.com/containers/concepts/architecture/)

Workers Paid starts at **$5 per account per month**, including 10 million requests and 30 million CPU milliseconds. Overage is $0.30/million requests and $0.02/million CPU milliseconds. Workers Free allows 100,000 requests/day and 10 ms CPU/invocation. Workers has no separate egress charge. For example, 1 million requests at 10 ms CPU each stays within the paid compute allowance; databases and other services retain their own meters. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

### An always-running container is a different bill

For one `standard-1` instance (0.5 vCPU capacity, 4 GiB memory, 8 GB ephemeral disk) running 730 hours, with all included quotas unused elsewhere:

| Component | Calculation | USD/month |
| --- | --- | ---: |
| Workers account plan | Base subscription | 5.00 |
| Memory | (4 × 730 − 25) GiB-hours × 3,600 × $0.0000025 | 26.055 |
| Disk | (8 × 730 − 200) GB-hours × 3,600 × $0.00000007 | 1.42128 |
| Subtotal before CPU | Sum | **32.47628** |
| Example active CPU | (0.05 × 730 × 3,600 − 375 × 60) vCPU-seconds × $0.000020 | 2.178 |
| Example subtotal | Including average use of 0.05 vCPU | **34.65428** |

This is calculated pricing, not a measured bill. Add applicable Workers/Durable Objects overages, logs, persistent storage and network charges. EU/NA container egress includes 1 TB/month, then $0.025/GB. Memory/disk are allocated-resource charges while running; CPU is active usage. Sleeping reduces costs. [Containers pricing](https://developers.cloudflare.com/containers/platform/pricing/)

A 0.5-vCPU container and a 2-vCPU VM are not performance equivalents. The table isolates why low CPU activity does not make a continuously running container almost free.

### Storage and compatibility affect the decision

Cloudflare's current FAQ says container disks are ephemeral and reset after sleep; disk snapshots are described as forthcoming. R2 via FUSE is available, but is not presented as native-SSD-equivalent storage. Containers can run without a fixed maximum duration, yet the platform may stop them. A durable database must therefore have an explicit persistence/recovery design. [Containers FAQ](https://developers.cloudflare.com/containers/faq/)

Workers' `node:child_process` is a non-functional stub, and its filesystem is virtual/temporary. This differs from running Node on a Linux machine. [Node compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/), [Workers filesystem](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/)

Current Cloudflare Next.js guidance recommends **vinext**, a Vite implementation of the Next.js API surface; it is labeled beta and requires compatibility assessment. OpenNext remains a documented path. Framework compatibility does not supply persistent local files or working OS subprocesses. [Next.js on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)

### What the tweet establishes

The [Mitchell Keller post](https://x.com/MitchellKeller_/status/2095576450791346626?s=20), inspected in Browser, praises the breadth of Cloudflare's services and quotes enthusiasm for Wrangler's agent usability. It contains no workload-specific cost comparison with Hetzner or EC2.

The platform has real free allowances, but general outbound email requires Workers Paid: 3,000 emails/month included, then $0.35/1,000. Sending to verified destination addresses in the account is free. [Email pricing](https://developers.cloudflare.com/email-service/platform/pricing/)

R2 is useful independently of application hosting: Standard storage includes 10 GB-month, 1 million Class A operations and 10 million Class B operations monthly; additional storage is $0.015/GB-month, with operation charges and no internet egress fee. It is a candidate for backup artifacts, not by itself a database backup/restore system. [R2 pricing](https://developers.cloudflare.com/r2/pricing/)

## Assessment for Server Guy

**Recommendation, not a newly accepted architecture decision:** retain Hetzner/existing Linux as the first application host, use Cloudflare for the services that fit, and add EC2 when AWS-specific demand justifies it. The evidence does not support replacing the Linux-host contract with Cloudflare Containers to reduce an always-on server bill.

Two separate decisions matter:

1. **Hosting Server Guy itself.** Current Phase 1 is a local Next.js/Node application. It opens a file-backed SQLite database through `better-sqlite3`, persists Pi configuration through filesystem operations, and invokes the `gh` executable. A Workers deployment requires changing these interfaces and validating the Pi runtime. Containers may accommodate the executable/runtime needs, but durable files still require a new storage design.
2. **Hosting applications managed by Server Guy.** Current product documentation targets deployment and recovery on a user-controlled Linux host. A Cloudflare-native application target could be useful for compatible greenfield projects, but would operate Workers, bindings, databases and platform deployments rather than producing the same Linux Host Record. Treating it as another VM provider would conceal real differences.

Verified repository references: [README](../../README.md), [database implementation](../../src/server/db.ts), [GitHub subprocess adapter](../../src/server/github.ts), [Pi configuration](../../src/server/pi-configuration.ts), [current AWS direction](../archive/previous-direction/docs/integrations/aws.md), [product workshop notes](../archive/previous-direction/docs/PRODUCT-WORKSHOP-NOTES.md).

The proposed division is:

- **Hetzner:** application containers, normal Node/Python processes and durable application/database volumes.
- **Cloudflare:** the existing DNS/HTTPS and external observation direction; consider R2 and email when those requirements become concrete.
- **EC2:** the same host lifecycle when AWS account integration, IAM/SSM or a client requirement makes the extra spend worthwhile.
- **Cloudflare-native target:** evaluate separately with one representative application if demand points there.

Cloudflare-first can be a simpler choice for a new application that fits its runtime and managed storage: it removes machine administration and provides integrated services. That operational saving has value beyond the provider invoice. Conversely, Hetzner's price does not include engineering time, tested backups, high availability or managed database operation. Neither the listed specifications nor this cost exercise is a performance benchmark or an availability comparison.

Before an all-in pivot, prove deploy, persistent data, migration, rollback, failure recovery and cost on the same representative app. Do not migrate the current product simply because a general-purpose CLI is convenient for coding agents.
