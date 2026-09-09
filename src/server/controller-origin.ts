// The controller currently binds loopback and has no network owner login.
// Reject arbitrary Host values on reads too; same-origin alone does not stop
// a domain which changes its DNS answer to a loopback address.
export function isControllerHost(host: string) {
  try {
    const parsed = new URL(`http://${host}`);
    return (
      !parsed.username &&
      !parsed.password &&
      parsed.pathname === "/" &&
      !parsed.search &&
      !parsed.hash &&
      ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) &&
      parsed.host === host.toLowerCase()
    );
  } catch {
    return false;
  }
}
