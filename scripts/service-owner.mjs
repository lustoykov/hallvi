// Which installation the loaded service belongs to. The service manager knows
// one Hallvi per user — launchd's `com.hallvi`, systemd's `hallvi.service` —
// whatever HOME or HALLVI_DATA_DIR say, so a second copy of the program that
// starts or stops "its" service is really replacing somebody else's.

/**
 * The program directory of the loaded service, read from what
 * `launchctl print gui/<uid>/com.hallvi` or
 * `systemctl --user show hallvi.service -p WorkingDirectory` printed.
 * Undefined when no service is loaded. The working directory is the one line
 * both print whole, so a path with spaces in it survives.
 */
export function serviceOwner(printed) {
  return /^\s*(?:working directory = |WorkingDirectory=)(\/.*)$/m.exec(
    printed,
  )?.[1];
}

/** Why this program must leave the loaded service alone, or nothing. */
export function foreignService(printed, app) {
  const owner = serviceOwner(printed);
  if (owner && owner !== app)
    return `The Hallvi service on this account belongs to another installation:
  service   ${owner}
  this one  ${app}
Nothing was changed. Use that installation's own hallvi command.`;
}
