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

import { SCRIPT_PATH } from "./contract";

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
 * routing settings are on each application's own tag (the page key and
 * explicit hash-routing opt-in, which `traffic_script` adds from the record). A
 * proxy in a container mounts this directory read-only at the same path.
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
  traefik(applicationId: string) {
    // Each provider merges router and service definitions across Compose
    // projects or dynamic files. The application's identity keeps a repeated
    // installation stable without colliding with another site's Host rule.
    const name = `hallvi-script-${createHash("sha256").update(applicationId).digest("hex").slice(0, 16)}`;
    return {
      /** Written to SCRIPT_DIRECTORY/Caddyfile, beside the script. */
      caddyfile: `:80 {
${caddyHandles.replace(/^/gm, "\t")}
}`,
      /** The container, on Traefik's network, routed by labels. */
      compose: `${name}:
  image: caddy:2
  restart: unless-stopped
  command: caddy run --config ${SCRIPT_DIRECTORY}/Caddyfile --adapter caddyfile
  volumes:
    - ${SCRIPT_DIRECTORY}:${SCRIPT_DIRECTORY}:ro
  labels:
    - traefik.enable=true
    - traefik.http.routers.${name}.rule=Host(\`app.example.com\`) && PathPrefix(\`/_hv/\`)
    - traefik.http.routers.${name}.entrypoints=websecure
    - traefik.http.routers.${name}.tls=true
    - traefik.http.routers.${name}.priority=10000
    - traefik.http.routers.${name}.service=${name}
    - traefik.http.services.${name}.loadbalancer.server.port=80`,
      /** The same router for a Traefik configured through files instead. */
      dynamic: `http:
  routers:
    ${name}:
      rule: Host(\`app.example.com\`) && PathPrefix(\`/_hv/\`)
      entryPoints: [websecure]
      tls: {}
      priority: 10000
      service: ${name}
  services:
    ${name}:
      loadBalancer:
        servers:
          - url: http://${name}:80`,
    };
  },
} as const;

/**
 * Where the tag goes for the stacks Pi meets most: the layout every page
 * shares. The plain include starts measurement; existing site controls can
 * optionally disable it (SCRIPT_PRIVACY). A site that sends a nonce-based
 * Content-Security-Policy gives the tag its nonce the way its other scripts
 * get one.
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
    note: "Add a <head> to the root layout's <html> if it has none. The deferred file can load before hydration and starts measurement without a separate grant callback.",
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

/** Site-specific integration, returned with the script so setup includes it. */
export const SCRIPT_PRIVACY = {
  consent: {
    default: "on",
    change: `function setAnalyticsConsent(granted) {
  window.hvConsent = granted === true;
  window.hv?.consent?.(window.hvConsent);
}`,
    rules: [
      "The plain include measures immediately. Do not add a banner, prompt or mandatory grant callback unless the owner requests it. Preserve existing site controls; when integrating them, set window.hvConsent = false before the deferred script loads to start disabled and use the callback for later changes.",
      "The script stores no preference, cookie or persistent visitor identifier. Existing site controls own remembering and propagating their choice; do not add a visitor identifier.",
      "Disabling stops measurement immediately without a final event. Re-enabling starts a fresh view of the current page without replaying earlier activity.",
    ],
  },
  notice: {
    draft:
      "We use Hallvi to measure page views, referral sources and campaign tags, device information, time on page, page speed and JavaScript error counts. Each page view has a temporary random identifier. Measurement requests go to this site's server and enter its access log, which can include your IP address and browser information. Hallvi reads that log on the operator's controller to produce traffic totals. The script stores no cookies or visitor identifier in your browser.",
    deploymentFacts: [
      "Identify the site operator and privacy contact; include DPO details where applicable, purposes and legal bases, recipients/processors and actual hosting/controller locations, any international transfers and their safeguards, and the applicable rights and supervisory-authority complaint route. If the owner requests a notice, confirm these facts; do not invent them or publish placeholders. This draft covers Hallvi measurement only, not the site's other processing.",
      "State the actual access-log retention, including proxy/CDN/backup copies, and traffic-total retention on the controller (Hallvi keeps stored totals until the owner uses Forget stored totals). IP addresses and user agents are used in memory for daily visitor estimates; country and device breakdowns and page/campaign values can be retained in totals. Do not call raw logs or all totals anonymous, or claim that all data stays on the web server.",
      "Paths, configured page-query values and campaign tags can contain personal data. Keep personal information out of them and of manual goal names; exclude sensitive pages from script measurement using the optional controls. Disabling stops the script, not the web server's ordinary request/security logs; disclose those separately with their actual purpose, basis and retention.",
      "Cookie-free does not establish a consent exemption. Do not claim GDPR compliance or an audience-measurement exemption from the script's technical design.",
    ],
  },
};
