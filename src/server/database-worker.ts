import { closeDatabase, openDatabase, operations } from "./database-store";
import { serveDatabaseThread } from "./database-thread";

serveDatabaseThread({ open: openDatabase, close: closeDatabase, operations });
