// PROTOTYPE · opus-ui-improvements · chosen for Database.
// What the Database page says over time: when the database passed or failed
// its check, when it was copied off the server and when a restore was
// tested, one dated mark each. Built on the same record the Processes page
// reads (stack-model.ts); nothing here is observed live.

import { type StackStory } from "../stack-prototype/stack-model";

// The two the Timeline design draws are shared with the records path, so
// they live beside it rather than inside this builder.
export type { Lane, Mark } from "./data-story";
import type { Mark } from "./data-story";

export interface DataStory extends StackStory {
  marks: Mark[];
  newestCopyAt: string | null;
}
