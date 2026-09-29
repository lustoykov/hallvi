// Source checkouts load TypeScript here; releases run the bundled worker and
// do not need a loader. Register inside this thread (parent loaders do not
// automatically apply to worker entry points).
import { register } from "tsx/esm/api";
register();
await import("../src/server/database-worker.ts");
