/**
 * What kind of software an application is, read from its repository, so the
 * homepage can draw the right screen and say what it is for. Unknown
 * software gets the generic screen and its repository as the purpose;
 * nothing here is a runtime fact.
 */
export type ApplicationKind =
  | "documents"
  | "publishing"
  | "photos"
  | "metrics"
  | "files"
  | "home"
  | "feeds"
  | "passwords"
  | "media"
  | "code"
  | "uptime"
  | "music"
  | "generic";

const KNOWN: [RegExp, ApplicationKind, string][] = [
  [/paperless/, "documents", "Document archive"],
  [/ghost/, "publishing", "Publication"],
  [/immich|photoprism/, "photos", "Photo library"],
  [/grafana/, "metrics", "Monitoring dashboard"],
  [/nextcloud|owncloud|seafile/, "files", "Files and calendar"],
  [/home-assistant|homeassistant/, "home", "Home automation"],
  [/miniflux|freshrss|tt-rss/, "feeds", "Feed reader"],
  [/vaultwarden|bitwarden/, "passwords", "Password vault"],
  [/jellyfin|plex|emby/, "media", "Films and series"],
  [/gitea|forgejo|gitlab/, "code", "Code hosting"],
  [/uptime-kuma|uptime_kuma/, "uptime", "Uptime monitor"],
  [/navidrome|funkwhale/, "music", "Music collection"],
];

export function applicationKind(source: string, name: string) {
  const identity = `${source} ${name}`.toLowerCase();
  const hit = KNOWN.find(([pattern]) => pattern.test(identity));
  return hit
    ? { kind: hit[1], purpose: hit[2] }
    : { kind: "generic" as ApplicationKind, purpose: source };
}

/** The application's own colour, for the ground under its screen. */
export const KIND_ACCENT: Record<ApplicationKind, string> = {
  documents: "#5b7fd6",
  publishing: "#c26a8a",
  photos: "#e0a24a",
  metrics: "#73bf69",
  files: "#0082c9",
  home: "#f9b233",
  feeds: "#e08a3c",
  passwords: "#175ddc",
  media: "#aa5cc3",
  code: "#609926",
  uptime: "#5cdd8b",
  music: "#4361ee",
  generic: "#7198db",
};

function mix(a: string, b: string, t: number) {
  const n = (h: string) =>
    [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [n(a), n(b)];
  return `#${x
    .map((v, i) =>
      Math.round(v + (y[i] - v) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/**
 * The caretaker's paint: the application's colour softened halfway toward
 * the shell's slate blue, so a dozen of them still look like one family.
 * Identity, never state; the face carries the state.
 */
export const caretakerPaint = (kind: ApplicationKind) =>
  mix(KIND_ACCENT[kind], "#9aa9c3", 0.5);
