import { serveDatabaseThread } from "./database-thread";
import {
  closeTrafficDatabase,
  openTrafficDatabase,
  operations,
} from "./traffic/database-store";

serveDatabaseThread({
  open: openTrafficDatabase,
  close: closeTrafficDatabase,
  operations,
});
