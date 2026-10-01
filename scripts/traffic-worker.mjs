// Source checkouts register the loader inside the Traffic database thread.
import { register } from "tsx/esm/api";
register();
await import("../src/server/traffic-worker.ts");
