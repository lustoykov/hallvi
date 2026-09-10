// PROTOTYPE · claude/architecture-directions · throwaway.
// What each Overview direction's top section receives. The page around it
// (header, the map in miniature, recent work, ideas) stays the same.

import type { ApplicationSection } from "../application-sections";
import type { PageContext } from "../architecture-prototype";
import type {
  ArchitectureModel,
  LiveRecord,
} from "../architecture-prototype/model";
import type { Recheck } from "../architecture-prototype/use-recheck";
import type { Overview } from "./overview-model";

export interface HeroProps {
  model: ArchitectureModel;
  record: LiveRecord;
  overview: Overview;
  recheck: Recheck;
  page: PageContext;
  /** The model's clock minus the browser's, for countdowns. */
  offset: number;
  /** The part being pointed at anywhere on the page. */
  pointed: string | null;
  onPoint: (partId: string | null) => void;
  /** Opens Architecture with that part's details open. */
  onShow: (partId: string) => void;
  onAsk: (draft: string) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
}
