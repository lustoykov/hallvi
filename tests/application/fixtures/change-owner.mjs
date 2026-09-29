// A separate process is essential: production Next and Pi never share a hub.
import { createServer } from "node:http";
import { ownChangeNotifications } from "../../../src/server/change-notifications.ts";
import { workerSocketPath } from "../../../scripts/worker-socket.mjs";

const changes = ownChangeNotifications();
let subscribers = 0;
let connections = 0;
const batches = [];
const counts = () =>
  process.send?.({ kind: "counts", subscribers, connections, batches });
const server = createServer((incoming, outgoing) => {
  if (incoming.url === "/changes") {
    subscribers++;
    connections++;
    counts();
    outgoing.on("close", () => {
      subscribers--;
      counts();
    });
  }
  if (incoming.url === "/changed") {
    let text = "";
    incoming.on("data", (chunk) => (text += chunk));
    incoming.on("end", () => {
      batches.push(JSON.parse(text).length);
      counts();
    });
  }
  if (!changes.handle(incoming, outgoing)) outgoing.writeHead(404).end();
});
process.on("message", (message) => changes.notify(message));
server.listen(workerSocketPath(process.env.HALLVI_DB_PATH), () =>
  process.send?.({ kind: "ready" }),
);
process.on("SIGTERM", () => {
  changes.close();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
