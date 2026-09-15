// What the Callers and Rings designs draw, and nothing else.
// ReachStory satisfies it structurally, so the visual reference is untouched.

export type Reach = "internet" | "restricted" | "private" | "closed";
/** Who said so: the provider read it back, the plan intends it, or a
 * process is what tells us. */
export type Told = "provider" | "plan" | "stack";

export interface Door {
  id: string;
  port: string;
  title: string;
  serves: string | null;
  reach: Reach;
  sources: string[];
  /** Worth a second look, in words. */
  concern: string | null;
  detail: string;
  /** Nobody has checked this one. */
  unasked?: boolean;
}

export interface Guard {
  id: string;
  title: string;
  at: string | null;
  detail?: string;
}

export interface Hole {
  id: string;
  title: string;
  detail: string;
}

export interface Caller {
  id: string;
  who: string;
  from: string;
  typed: string;
  outcome: "loads" | "refused" | "no-name" | "insecure" | "no-answer";
  secure: boolean;
  headline: string;
  detail: string;
  /** Whether we watched it, only asked, or know it is not there. */
  sure: "proved" | "asked" | "absent";
  at: string | null;
}

export interface DomainState {
  name: string;
  provider: "cloudflare" | "external";
  /**
   * Five states, because a name can be wrong in four different ways and a
   * page that collapses them tells a reader to go and look somewhere else.
   *
   * `serving` is the only one that says the application answers, and it is
   * reachable only from a check that actually asked for the name over HTTP.
   * `resolving` is the honest middle: the name works and nobody has found
   * out what is behind it. A proxied name sits in `unreachable` while it
   * resolves perfectly and serves a valid certificate, which is exactly the
   * case that used to read as success.
   */
  state: "serving" | "unreachable" | "resolving" | "pending-dns" | "failed";
  detail: string;
  /** What the record points at, as the provider holds it. */
  origin?: string | null;
  /**
   * Whether the provider answers for the name instead of the origin. Null
   * when nothing recorded it: an unread field is not a direct record.
   */
  proxied?: boolean | null;
  /** Something true and awkward about the record, said rather than hidden. */
  concern?: string | null;
  userStep?: string | null;
  /**
   * When the name last answered, on a `serves` check that passed and has
   * since aged past its horizon. Set only in that case, because it is the
   * one the other fields cannot express: the state falls back to
   * `resolving`, which reads as "nobody has found out what is behind it"
   * and is exactly wrong. Somebody did find out; it was a while ago.
   */
  lastServedAt?: string | null;
}

export interface TlsState {
  /**
   * `not-configured` means a record established there is no certificate.
   * `unknown` means nobody has looked, which is a different answer and the
   * far more common one — saying "there is no certificate" because no record
   * mentions one is the same mistake as calling an unchecked server dead.
   */
  state: "valid" | "pending" | "failed" | "not-configured" | "unknown";
  issuer?: string | null;
  expiresAt?: string | null;
  renewal?: string | null;
  detail?: string | null;
}

export interface ReachView {
  name: string;
  address: string | null;
  domain: DomainState | null;
  tls: TlsState;
  /** Who the deployment opened HTTP to. */
  audience: "public" | "controller";
  controllerIp: string | null;
  callers: Caller[];
  doors: Door[];
  processes: import("../stack-prototype/line-story").ProcessCard[];
  database: import("../data-prototype/data-story").DataStore | null;
  ssh: {
    word: string;
    tone: "verified" | "stale" | "planned" | "failed" | "checking";
    detail: string;
    told: Told;
  };
  firewall: {
    state: "read" | "asked" | "none";
    provider: string;
    name: string | null;
    at: string | null;
    detail: string;
  };
  guards: Guard[];
  holes: Hole[];
  /** Set only in the isolated visual reference; always null on records. */
  invented: string | null;
}

export interface ReachProps {
  story: ReachView;
  now: number;
  head: import("react").ReactNode;
  /** Work in progress on this destination, as the shell shows it. */
  activity: import("react").ReactNode;
  onAsk: (draft: string) => void;
  onOpenDestination: (
    destination: import("../application-sections").ApplicationSection,
  ) => void;
  /** The shell's own note about the provider read, when there is one. */
  panel?: import("react").ReactNode;
  /** Reads the firewall from the provider again; the shell owns the read. */
  onCheck?: () => void;
  checking?: boolean;
}

/**
 * What the Domains page offers to do about a name, which is three different
 * offers and never one.
 *
 * A name nobody has connected is an invitation. A name that is on record and
 * not yet serving the application is unfinished work, and offering to
 * "publish" it again reads as starting over. A name that serves is something
 * the owner may want to take back. Each draft is a sentence they can send as
 * it stands or finish typing; none of them invents a hostname.
 */
export function publishOffer(story: {
  name: string;
  domain: DomainState | null;
}): { label: string; primary: boolean; draft: string } {
  const domain = story.domain;
  if (!domain)
    return {
      label: "Publish at a domain…",
      // The only invitation on the page, so the only emphatic thing on it.
      primary: true,
      draft: `Publish ${story.name} at my own domain name. The hostname is: `,
    };
  if (domain.state === "serving")
    return {
      label: "Make it private again",
      primary: false,
      draft: `Make ${story.name} private again: withdraw ${domain.name} and the public access you set up for it, leave SSH and anything you did not create alone, and give me back a private way in.`,
    };
  // A name that answered, a while ago, is published. What is old is the
  // evidence, and the work to offer is looking again — never finishing a
  // job that was finished, which is what "Finish publishing it" claims.
  if (domain.lastServedAt)
    return {
      label: "Check it from outside",
      primary: false,
      draft: `${domain.name} answered when it was last checked, and that reading has aged. Ask for it from outside again and tell me what ${story.name} returns now.`,
    };
  return {
    label: "Finish publishing it",
    primary: false,
    draft: `${domain.name} is not serving ${story.name} yet. Find out which part is incomplete, finish publishing it, and check it from outside.`,
  };
}
