import type { ReferenceState } from "./data";

export interface ScenarioStep {
  id: string;
  title: string;
  /** One line on what this step shows. */
  note: string;
  clock: string;
  apply: (state: ReferenceState) => void;
}

export interface Scenario {
  id: "simple" | "rich";
  name: string;
  summary: string;
  initial: () => ReferenceState;
  steps: ScenarioStep[];
}
