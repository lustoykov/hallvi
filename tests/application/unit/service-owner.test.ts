import { expect, it } from "vitest";

import {
  foreignService,
  serviceOwner,
} from "../../../scripts/service-owner.mjs";

// Never through the command: start, stop, restart and uninstall act on the one
// `com.hallvi` (or `hallvi.service`) the user has, whatever HOME says, so
// running them here would replace the developer's own installation. Only the
// text the service manager prints is tested.
const installed = "/Users/owner/.local/lib/hallvi/app";
const launchd = `gui/502/com.hallvi = {
	active count = 1
	path = /Users/owner/Library/LaunchAgents/com.hallvi.plist
	state = running

	program = /Users/owner/.local/lib/hallvi/node/bin/node
	arguments = {
		/Users/owner/.local/lib/hallvi/node/bin/node
		${installed}/scripts/serve.mjs
	}

	working directory = ${installed}

	stdout path = /Users/owner/.local/share/hallvi/logs/service.log
}
`;

it("leaves a service that belongs to another installation alone", () => {
  expect(serviceOwner(launchd)).toBe(installed);
  expect(foreignService(launchd, installed)).toBeUndefined();

  const checkout = "/Users/owner/code/hallvi";
  const refusal = foreignService(launchd, checkout);
  expect(refusal).toContain(installed);
  expect(refusal).toContain(checkout);

  const systemd = "WorkingDirectory=/home/owner/My Programs/hallvi/app\n";
  expect(serviceOwner(systemd)).toBe("/home/owner/My Programs/hallvi/app");

  // Nothing loaded: launchctl prints nothing to stdout, systemd an empty value.
  expect(foreignService("", checkout)).toBeUndefined();
  expect(foreignService("WorkingDirectory=\n", checkout)).toBeUndefined();
});
