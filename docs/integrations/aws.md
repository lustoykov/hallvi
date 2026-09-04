# AWS Integration Direction

**Status:** Planned learning and product direction; not implemented  
**Current product boundary:** Hetzner remains the V1 reference provider. AWS does not replace the current Linux-host path.

This document owns AWS-specific design boundaries, capability detail, and references. Development order and implementation status belong to the [Server Guy roadmap](../../ROADMAP.md#aws-integration-direction).

## Decision

Add AWS in two deliberately separate forms:

1. **EC2 Host Adapter:** a future Server Guy integration that provisions an AWS virtual machine and returns the same provider-independent Deployment Host and Host Record used by the Hetzner path.
2. **AWS ECS/Fargate Deployment Target:** first a manual learning lab; automate it in Server Guy only after concrete client demand.

“AWS-managed application platform” is too vague. The precise term for the second path is **AWS ECS/Fargate Deployment Target**.

```text
Application Contract
│
├── Deployment Host
│   ├── Hetzner VPS        ← V1 reference path
│   ├── Existing Linux     ← adopted host
│   └── AWS EC2            ← future Host Adapter
│       └── common Linux-host deployment and recovery lifecycle
│
└── AWS ECS/Fargate Deployment Target
    └── a separate graph of managed AWS resources
```

EC2 is an AWS virtual server. Server Guy still manages an identifiable Linux machine: install the runtime, start containers, inspect the host, deploy Releases, and recover the application.

ECS/Fargate is a different deployment model. Server Guy would manage task definitions, services, networking, permissions, releases, and supporting AWS resources rather than one machine.

## Capability detail

### Generic Linux-host lifecycle

Finish the Hetzner and adopted-Linux path first. This is where Server Guy learns the portable deployment contract:

- container lifecycle;
- networking and TLS;
- configuration and secrets;
- health checks and external verification;
- persistent storage and backups;
- logs and telemetry;
- rollback and recovery.

The application-level contract should not change when the Linux machine comes from another provider. See [the current hosting research](../research/2026-08-31-self-hosting-demand-and-use-cases.md) and [Application Launch](../user-journeys/01-application-launch.md).

### EC2 Host Adapter

The EC2 adapter owns AWS-facing reconciliation and emits the same Host Record consumed by the common Linux-host lifecycle.

```text
AWS credentials + selected account/region/network
  ↓
EC2 Host Adapter
  ├── reconcile EC2 instance
  ├── reconcile Security Group
  ├── reconcile EBS storage
  ├── allocate/associate Elastic IP when required
  ├── attach approved instance profile
  ├── establish SSM administration path
  ├── connect host logs to CloudWatch
  └── calculate cost and cleanup effects
  ↓
Host Record
  ↓
Common Linux-host deploy / verify / recover lifecycle
```

This slice should teach:

- AWS credential resolution and least-privilege IAM;
- EC2 instance lifecycle;
- Security Groups;
- EBS volumes and persistence;
- Elastic IP allocation and release;
- instance roles and instance profiles;
- SSM access;
- CloudWatch log shipping;
- AWS cost inspection and deletion semantics.

Keep two identities separate:

- the **Server Guy control principal**, which may inspect and reconcile approved AWS resources;
- the **EC2 instance role**, which gives the machine only the permissions required for SSM, logging, and explicitly approved runtime integrations.

The first slice should use an explicitly selected existing VPC and subnet rather than claiming ownership of the client's wider network architecture. Organization-wide IAM, VPC design, NAT gateways, multi-account governance, and a general AWS platform are outside this adapter.

SSM can replace inbound SSH for the AWS administration path, but the commands, readiness checks, deployment operations, and recovery evidence above that transport remain part of the common Linux-host lifecycle.

### Cleanup is a resource graph, not one delete call

Destroying an EC2-backed Deployment Host must preview and record separate effects:

- terminate the EC2 instance;
- delete or deliberately retain each EBS volume according to its recorded policy;
- disassociate and release an Elastic IP when it is no longer required;
- delete only Security Groups and other resources that Server Guy created and still owns;
- retain or remove log groups, snapshots, and IAM resources according to explicit ownership and retention policy;
- re-read AWS inventory and prove which managed resources were removed or intentionally retained.

AWS documents that EBS persistence depends on each volume's `DeleteOnTermination` setting, while an Elastic IP remains allocated to the account until explicitly released. These semantics belong in the Launch Plan, approval, cost view, deletion receipt, and post-delete verification—not in hidden cleanup code.

Primary references:

- [IAM roles and instance profiles for EC2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html)
- [Session Manager prerequisites](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-prerequisites.html)
- [EC2 Security Groups](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/creating-security-group.html)
- [EBS behavior when an instance is terminated](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/preserving-volumes-on-termination.html)
- [EC2 networking and Elastic IP lifetime](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-networking.html)
- [CloudWatch agent for metrics, logs, and traces](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Install-CloudWatch-Agent.html)
- [Amazon VPC public IPv4 pricing](https://aws.amazon.com/vpc/pricing/)

### Manual ECS/Fargate lab

Do this once outside Server Guy before automating it:

```text
Build image → ECR
Create task definition
Create ECS service on Fargate
Attach Application Load Balancer
Connect RDS
Configure task role and Secrets Manager
Export logs to CloudWatch
Deploy a new revision
Trigger a representative failure
Roll back and verify recovery
```

The concrete managed-AWS responsibility map is:

| Responsibility | AWS service |
| --- | --- |
| Container registry | ECR |
| Container execution | ECS + Fargate |
| Public traffic | Application Load Balancer |
| PostgreSQL | RDS |
| Secrets | Secrets Manager |
| Workload permissions | IAM task roles |
| Logs and metrics | CloudWatch |
| Queue when required | SQS |
| Files when required | S3 |

This is the enterprise AWS learning exercise. It is not evidence that ECS/Fargate belongs inside Server Guy yet.

### ECS/Fargate automation trigger

An ECS/Fargate target is not another Host Adapter:

```text
EC2 Host Adapter
  Provision machine → emit Host Record → run common host reconciler

ECS/Fargate Deployment Target
  Reconcile ECR + task definition + service + load balancer
  + IAM + secrets + networking + database + deployment state
```

Automate the managed target only when a client or validated product use case requires it and the manual deployment has established its release, rollback, observability, cost, authority, and deletion model. If that happens, give it a separate target contract rather than scattering AWS conditionals through the Deployment Host implementation.

## Development roadmap

See the [AWS implementation backlog](../../ROADMAP.md#aws-integration-direction) for the ordered work and status. Do not maintain a second sequence here.

The governing principle is: **do not distort the product into a curriculum**. Use Server Guy to learn deployment and recovery deeply; use the separate ECS/Fargate lab to learn the managed AWS resource graph; connect them only after both contracts are understood and there is a customer reason.
