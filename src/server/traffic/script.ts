// The traffic script, and how an application's own proxy serves it.
//
// docs/design/traffic.md owns the design. The script is served on the
// application's domain at /_hv/s.js and sends each event as a request to
// /_hv/e/1/<event>, which the proxy answers itself with 204 and logs like any
// other request. Nothing reaches the application and nothing of Hallvi's
// listens on the internet: the log is the collector.
//
// This is what Pi needs to set that up: the file to put on the server, what
// each proxy adds to serve it, and the line that puts it in the layout every
// page shares. That line goes in through a pull request the owner merges, or
// the software's own code-injection setting — never by rewriting pages at the
// proxy (PRODUCT.md, "Operating boundary").
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PAGE_KEY_ATTRIBUTE, SCRIPT_PATH } from "./contract";

/**
 * The script as the proxy serves it: src/traffic-script/hv.js without its
 * whole-line comments and indentation, which halves what every visitor
 * downloads. `version` is the start of `sha256`, so it can never disagree
 * with the content; compare a server's copy with `sha256sum`.
 */
export function trafficScript() {
  const source = readFileSync(
    join(
      /* turbopackIgnore: true */ process.cwd(),
      "src",
      "traffic-script",
      "hv.js",
    ),
    "utf8",
  );
  const content = `${source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//"))
    .join("\n")}\n`;
  const sha256 = createHash("sha256").update(content).digest("hex");
  return { content, sha256, version: sha256.slice(0, 12) };
}

/** What the layout every page shares includes. */
export const SCRIPT_TAG = `<script defer src="${SCRIPT_PATH}"></script>`;

/**
 * Where the script lives on the application's server. One file serves every
 * application there: its events go back to whichever site loaded it, and its
 * one setting, a page key, is on each application's own tag
 * (`SCRIPT_PAGE_KEY`). A proxy in a container mounts this directory read-only
 * at the same path.
 */
export const SCRIPT_DIRECTORY = "/srv/hallvi";
export const SCRIPT_FILE = `${SCRIPT_DIRECTORY}${SCRIPT_PATH}`;

// An hour: a changed script reaches visitors the same day, and a browser
// that asks again gets a 304. Events are never cached — they are POSTs, and
// the 204 says so for anything in between.
const CACHE = "public, max-age=3600";

const caddyHandles = `# Hallvi's traffic script and its events, answered here; neither reaches
# the application. The events are logged like any other request.
handle ${SCRIPT_PATH} {
	root * ${SCRIPT_DIRECTORY}
	header Cache-Control "${CACHE}"
	encode gzip
	file_server
}
handle /_hv/e/* {
	header Cache-Control "no-store"
	respond 204
}`;

/**
 * What each proxy adds, tested against Caddy, nginx and Traefik themselves:
 * the script is served, every event is answered with 204 and lands in the
 * access log with its payload intact.
 */
export const SCRIPT_SERVING = {
  /**
   * Inside the application's site block, beside what proxies it: `handle`
   * runs before `reverse_proxy`, `php_fastcgi` and `file_server`, and these
   * two end the request. `try_files` and `rewrite` run before `handle`, so a
   * site that rewrites at the top (a single-page application's
   * `try_files {path} /index.html`) moves its own directives into a
   * `handle { … }` of their own first.
   */
  caddy: caddyHandles,
  /**
   * Inside the application's `server` block. `=` and `^~` win over any
   * regular-expression location the site already has (a `\.js$` that
   * caches assets, a `\.php$` that passes everything on). Neither location
   * may turn `access_log` off: the events are only counted from the log.
   */
  nginx: `# Hallvi's traffic script and its events, answered here; neither reaches
# the application. The events are logged like any other request.
location = ${SCRIPT_PATH} {
    root ${SCRIPT_DIRECTORY};
    types { text/javascript js; }
    add_header Cache-Control "${CACHE}";
    gzip on;
    gzip_types text/javascript;
}
location ^~ /_hv/e/ {
    add_header Cache-Control "no-store";
    return 204;
}`,
  /**
   * Traefik cannot serve a file or answer a request by itself, so a small
   * Caddy container beside it does both, and a router sends the
   * application's `/_hv/` to it. The request still passes through Traefik,
   * so Traefik's access log records every event. The router must use the
   * application's own host, entry points and TLS, and its priority keeps it
   * ahead of the application's router whatever that router's rule is.
   */
  traefik: {
    /** Written to SCRIPT_DIRECTORY/Caddyfile, beside the script. */
    caddyfile: `:80 {
${caddyHandles.replace(/^/gm, "\t")}
}`,
    /** The container, on Traefik's network, routed by labels. */
    compose: `hallvi-script:
  image: caddy:2
  restart: unless-stopped
  command: caddy run --config ${SCRIPT_DIRECTORY}/Caddyfile --adapter caddyfile
  volumes:
    - ${SCRIPT_DIRECTORY}:${SCRIPT_DIRECTORY}:ro
  labels:
    - traefik.enable=true
    - traefik.http.routers.hallvi-script.rule=Host(\`app.example.com\`) && PathPrefix(\`/_hv/\`)
    - traefik.http.routers.hallvi-script.entrypoints=websecure
    - traefik.http.routers.hallvi-script.tls=true
    - traefik.http.routers.hallvi-script.priority=10000
    - traefik.http.services.hallvi-script.loadbalancer.server.port=80`,
    /** The same router for a Traefik configured through files instead. */
    dynamic: `http:
  routers:
    hallvi-script:
      rule: Host(\`app.example.com\`) && PathPrefix(\`/_hv/\`)
      entryPoints: [websecure]
      tls: {}
      priority: 10000
      service: hallvi-script
  services:
    hallvi-script:
      loadBalancer:
        servers:
          - url: http://hallvi-script:80`,
  },
} as const;

/**
 * For an application whose `access-log` record has a `pageKey` — it routes
 * pages by a query key — the tag names that key, so the script tells its
 * pages apart as the log does. Only that key's value is ever sent.
 */
export const SCRIPT_PAGE_KEY = `An application whose access-log record has a pageKey (it routes pages by a query key, like WordPress's p) adds ${PAGE_KEY_ATTRIBUTE}="<that key>" to the tag, in every line below: <script defer src="${SCRIPT_PATH}" ${PAGE_KEY_ATTRIBUTE}="p"></script>. The script then sends that key's value, and nothing else of the query, so its pages are named as the log names them. Any other application leaves the attribute out.`;

/**
 * Where the tag goes for the stacks Pi meets most: the layout every page
 * shares, as early as the page allows. A site that sends a nonce-based
 * Content-Security-Policy gives the tag its nonce the way its other scripts
 * get one. `SCRIPT_PAGE_KEY` says when it also names a page key.
 */
export const SCRIPT_INCLUDES: readonly {
  stack: string;
  file: string;
  line: string;
  note?: string;
}[] = [
  {
    stack: "Next.js, App Router",
    file: "app/layout.tsx (or src/app/layout.tsx), inside <head>",
    line: `<script defer src="${SCRIPT_PATH}" />`,
    note: "Add a <head> to the root layout's <html> if it has none. A plain tag loads before hydration, so a visitor who leaves early is still counted.",
  },
  {
    stack: "Next.js, Pages Router",
    file: "pages/_document.tsx (or .js), inside <Head>",
    line: `<script defer src="${SCRIPT_PATH}" />`,
    note: "Create the standard _document if the application has none.",
  },
  {
    stack: "Plain HTML, or a Vite single-page application",
    file: "index.html (and every page of a hand-built site), inside <head>",
    line: SCRIPT_TAG,
    note: "Vite leaves a classic script alone; the file exists only behind the proxy, so development servers answer it with 404.",
  },
  {
    stack: "Astro",
    file: "the layout every page uses (src/layouts/*.astro), inside <head>",
    line: `<script is:inline defer src="${SCRIPT_PATH}"></script>`,
    note: "is:inline keeps Astro from bundling it.",
  },
  {
    stack: "SvelteKit",
    file: "src/app.html, inside <head>",
    line: SCRIPT_TAG,
  },
  {
    stack: "Rails",
    file: "app/views/layouts/application.html.erb, inside <head>",
    line: SCRIPT_TAG,
  },
  {
    stack: "Django",
    file: "the base template the others extend (templates/base.html), inside <head>",
    line: SCRIPT_TAG,
    note: "Not through {% static %}: the proxy serves it, not Django.",
  },
  {
    stack: "Laravel (Blade)",
    file: "resources/views/layouts/app.blade.php, inside <head>",
    line: SCRIPT_TAG,
  },
  {
    stack: "Ghost",
    file: "Settings → Code injection → Site header",
    line: SCRIPT_TAG,
    note: "The owner's own setting; nothing in the repository changes.",
  },
  {
    stack: "WordPress",
    file: "a header-code plugin the owner uses (WPCode: Code Snippets → Header & Footer → Header), or the theme's functions.php when the theme is in a repository",
    line: SCRIPT_TAG,
    note: "In functions.php: add_action('wp_head', function () { echo '<script defer src=\"/_hv/s.js\"></script>'; });",
  },
];
