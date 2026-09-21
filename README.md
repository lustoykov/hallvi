# Hallvi

**The agent for self-hosted software.** Hallvi helps you deploy an application
stack on a server you control, understand what is running, and operate it
through a conversation. The goal is to make owning your software practical
without hiding the server, its data, or the work being done.

## What it does

Give Hallvi a repository and ask it to deploy the application. It can inspect
the code, connect to Hetzner or an existing Linux server, prepare the host,
run the stack, and check the result. It asks for missing access and
consequential decisions. You can review commands before they run, follow
recorded output, and return to application views built from saved evidence.

Hallvi is an **alpha**. Its core deployment path is available, while the
broader care and recovery experience remains [in progress](ROADMAP.md). See
[Product](PRODUCT.md) for the intended scope and
[current architecture](docs/architecture.md) for what is implemented.

## Install

On an **Apple-silicon Mac** or **Ubuntu 24.04 x64** machine, paste this one line
into Terminal from a directory you can write to. Run it as your normal user,
without `sudo`:

```sh
curl -fsSLo ./install-hallvi.sh https://github.com/lustoykov/hallvi/releases/download/v0.1.1-alpha.1/install-hallvi.sh && sh ./install-hallvi.sh
```

The script detects your platform, downloads the newest published signed alpha
release for it, verifies the archive, installs Hallvi, and starts its background
service. The installer script remains in the current directory for inspection
or reuse. You do **not** need to clone this repository or install Node.js.
[Release assets](https://github.com/lustoykov/hallvi/releases/tag/v0.1.1-alpha.1)
are available for both platforms; Intel Macs and other Linux systems do not
have a prebuilt release yet.

Open <http://127.0.0.1:4747> on the machine running Hallvi. Connect ChatGPT,
add a repository, and connect Hetzner or a Linux server when Hallvi asks. For a
Mac mini or headless Ubuntu machine you use from a laptop, choose **From another
computer** during installation and follow the printed SSH instructions.
Managed applications run on a Linux deployment server; installing Hallvi on a
Mac does not make that Mac the deployment server.
[Installation details and remote access](docs/installation.md) cover first use,
updates, troubleshooting, and uninstalling.

## More information

[Beta precautions](docs/beta-safety.md) · [Documentation map](docs/README.md) · [Development setup](docs/development.md)
