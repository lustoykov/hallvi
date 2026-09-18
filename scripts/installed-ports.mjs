// The loopback ports an installed Hallvi uses, all derived from one number.
//
// They are fixed rather than found because a browser on another machine has to
// know them in advance. On a virtual machine the owner forwards these ports
// over SSH, and a port chosen at run time — the terminal's, or whichever one Pi
// picked for an application — would be a port nobody forwarded. Forwarding the
// interface alone reaches the interface and nothing behind it.
export function installedPorts(env = process.env) {
  const web = Number(env.HALLVI_PORT?.trim() || 4747);
  if (!Number.isInteger(web) || web < 1024 || web > 65000)
    throw new Error("HALLVI_PORT must be a port from 1024 to 65000.");
  return {
    web,
    /** The browser terminal's WebSocket. */
    terminal: web + 1,
    /** Where private application links open, one port per open link. */
    privateFirst: web + 10,
    privateLast: web + 19,
  };
}

/** Every port a remote browser needs, for an SSH configuration to forward. */
export function forwardedPorts(ports) {
  const list = [ports.web, ports.terminal];
  for (let port = ports.privateFirst; port <= ports.privateLast; port++)
    list.push(port);
  return list;
}
