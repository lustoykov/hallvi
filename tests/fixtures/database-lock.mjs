import Database from "better-sqlite3";
import { parentPort, workerData } from "node:worker_threads";

const database = new Database(workerData.path);
database.exec("BEGIN IMMEDIATE");
parentPort.postMessage("locked");
setTimeout(() => {
  database.exec("COMMIT");
  database.close();
  parentPort.close();
}, workerData.holdMs);
