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

/**
 * The colours an owner's applications wear: the ground under the screen, the
 * card's selected border and the caretaker's paint.
 *
 * A fixed set chosen to sit together and beside the shell's slate blue,
 * rather than each upstream project's brand colour softened toward grey,
 * which gave a washed mint for anything green. Hallvi's own periwinkle is not
 * among them: that one is Little Server's when it speaks for Hallvi.
 */
export const APPLICATION_COLORS = [
  "#6f9fd8", // sky
  "#d9a35f", // honey
  "#a58bd3", // violet
  "#5fa6a0", // teal
  "#d98878", // coral
  "#7f9f7c", // moss
  "#cc86a8", // rose
  "#8c9fb9", // slate
] as const;

function hash(text: string) {
  let value = 0;
  for (const character of text)
    value = (value * 31 + character.charCodeAt(0)) >>> 0;
  return value;
}

/**
 * One colour per application, keyed by id. Each starts from a colour its id
 * chooses, so it keeps it as others come and go; when an older application
 * already wears that one, it takes the next that is free, so two cards side
 * by side are told apart until there are more applications than colours.
 * `ids` is oldest first.
 */
export function applicationColors(ids: string[]) {
  const taken = new Set<number>();
  const colors = new Map<string, string>();
  for (const id of ids) {
    let index = hash(id) % APPLICATION_COLORS.length;
    if (taken.size < APPLICATION_COLORS.length)
      while (taken.has(index)) index = (index + 1) % APPLICATION_COLORS.length;
    taken.add(index);
    colors.set(id, APPLICATION_COLORS[index]!);
  }
  return colors;
}
