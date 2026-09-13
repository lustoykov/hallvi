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
