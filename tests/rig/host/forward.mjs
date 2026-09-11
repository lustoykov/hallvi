// Forward a local TCP port to another, so a second rig host published on a
// different port is reachable at the address the provider stand-in records
// (127.0.0.1:80). One rig host at a time can own that address; stop the
// first host's container before pointing the forward at the second.
// Usage: node tests/rig/host/forward.mjs <listen-port> <target-port>
import { createConnection, createServer } from "node:net";

const [listen = "80", target = "8082"] = process.argv.slice(2);
const server = createServer((socket) => {
  const upstream = createConnection({
    host: "127.0.0.1",
    port: Number(target),
  });
  socket.pipe(upstream).pipe(socket);
  const drop = () => {
    socket.destroy();
    upstream.destroy();
  };
  socket.on("error", drop);
  upstream.on("error", drop);
});
server.listen(Number(listen), "127.0.0.1", () =>
  console.log(`forwarding 127.0.0.1:${listen} -> 127.0.0.1:${target}`),
);
