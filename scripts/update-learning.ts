import { resolve } from "node:path";
import {
  prepareLearningUpdate,
  publishLearningUpdate,
} from "../tests/dashboard/learning-update.ts";

const [command, argument, ...extra] = process.argv.slice(2);
try {
  if (
    extra.length ||
    (command === "prepare" && argument && argument !== "--force") ||
    !["prepare", "publish"].includes(command) ||
    (command === "publish" && !argument)
  )
    throw new Error(
      "Usage: node --experimental-strip-types scripts/update-learning.ts prepare [--force] | publish <review-directory>",
    );
  const result =
    command === "prepare"
      ? prepareLearningUpdate(process.cwd(), argument === "--force")
      : publishLearningUpdate(process.cwd(), resolve(argument));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
