# The remaining eleven destinations: what was proved

Companion to [`docs/remaining-views-contract.md`](../remaining-views-contract.md),
which says what each page promises. This says what was actually run and what
it found.

## Rig

| | |
|---|---|
| host | `sg-rig-views`, Linux container with systemd and its own dockerd |
| SSH | real `sshd` inside it, published on `127.0.0.1:2224` |
| controller | `tests/results/rig/views`, port 3420 |
| stand-ins | GitHub API, Hetzner API. Everything else is the product. |

The product does its own host-key scan, its own key authentication and its own
`ssh -M -f -N -T -L` forward. Only the address is the rig's fiction.

## What real records found

Each of these was a page saying more than its records supported. None would
have been caught by a fixture, because a fixture is written by the same person
as the reader.

| what the page said | what the records said |
|---|---|
| "Port 80 → its port" | `127.0.0.1:3000 → 3000/tcp`, written the way Docker writes it |
| "Your network · No address filter" | a door recording `127.0.0.1 only` |
| "Port 80 on the server, opened by the firewall" | an SSH tunnel to loopback, with neither |
| five sources: Server, loopback, via, SSH, tunnel | one source, in prose |
| memory `4 GB` as a **measurement** | `4 GB` is the spec sheet; usage was never recorded |
| a volume row wider than the server box it sits in | a volume named `grafana-prometheus_metrics` |

The last two are the interesting ones. Capacity and usage under one key would
have made Monitoring show what a machine was sold with and call it a reading;
they are now `memory` and `memory-used`, two claims with two bases. And the
layout only broke because a real volume name is longer than `uploads`.
