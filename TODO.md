# Server Guy TODOs

## AWS integration direction

The ordered plan and the boundary between an EC2 host and an ECS/Fargate deployment target are recorded in [docs/integrations/aws.md](docs/integrations/aws.md).

- [ ] Finish and prove the provider-independent Linux-host lifecycle on the Hetzner reference path.
- [ ] Add an EC2 Host Adapter that produces the same Host Record and reuses the Linux-host lifecycle.
- [ ] Manually deploy the same application to ECS/Fargate as a separate enterprise AWS lab.
- [ ] Consider automating ECS/Fargate only after concrete client demand justifies a second deployment target.

## Home-server controller mode

- [ ] Install Server Guy on an always-on home server and connect to it from the Mac over the same Wi-Fi/LAN.

Initial scope:

- The home server runs the authoritative Server Guy controller, monitoring, Pi runtime, and SQLite database.
- The Mac accesses its UI and API over the local network; no Tailscale dependency is required initially.
- Give the home server a stable LAN address or local hostname.
- Require authentication even on the home network.
- Do not share or synchronize the SQLite file with the Mac.
- Consider Tailscale later only for access from outside the home network.
