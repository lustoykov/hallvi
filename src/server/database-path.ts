import { stateLocation } from "../../scripts/state-location.mjs";

export function databasePath() {
  return (
    process.env.HALLVI_DB_PATH ??
    stateLocation(/* turbopackIgnore: true */ process.cwd(), { hidden: true })
      .database
  );
}
