# Traffic: who uses the application, and how it is doing

**Status:** Traffic v1 merged on 29 September 2026. Optional analytics controls
and removal of the automatic goal-tracking claim landed in PR #306. On
1 October the owner selected plain-include measurement without a banner or
mandatory grant callback; PR #315 also repairs the installed script path.
This document owns the design. The shared contract every
part is written against is [`src/server/traffic/contract.ts`](../../src/server/traffic/contract.ts);
[Product](../../PRODUCT.md#what-the-modes-cover) owns the collection rule.

## What it is for

Once an application is live, Hallvi says almost nothing about its use. Overview
follows the last five minutes of requests and keeps nothing; Monitoring shows
one day, and only when Pi is asked to read it. Nobody can answer "is anyone
using this, and is it growing?", and the usual answer — a third-party analytics
service with an account, a script and visitor data leaving the server — cuts
against owning the software.

Hallvi already sits in front of every request and knows every deploy. So the
owner sees, without asking and without setting anything up beyond one choice:

- **Their users:** who is on the site now, which pages, where they came from,
  which countries and devices, over 24 hours, 7 days and 30 days.
- **How the application is doing:** requests, errors and how many visitors hit
  them, response times, and what changed after each release.

It shows itself in the views where it belongs, from stored totals, without a
model call. Pi reads the same totals to explain them. It should feel like
Hallvi: light, calm, a little delightful — not a dashboard of zeros.

## Scope of v1

| Area | In v1 |
| --- | --- |
| Live | Arrivals as they happen (country · page · source), a light world map, "N open right now" with the script, "about N estimated visitors in the last 5 minutes" from the log alone |
| History | 24 h (hourly), 7 d and 30 d (daily): estimated visitors, page views, requests, errors and visitors affected, bots, response time |
| Breakdowns | Pages, sources and campaigns, countries, devices, browsers, operating systems |
| With the script | Page changes inside single-page applications, pages served from a CDN cache, time on page, open right now, goals, page speed (LCP, INP, CLS) and JavaScript error counts per page |
| Operations | Deploy markers on every chart, a before/after line on each release, Monitoring's traffic numbers from the same totals |
| Sources of truth | Caddy, nginx and Traefik access logs; Hallvi's script through the same log |
| Pi | `read_traffic` over the totals (main and side conversations); `traffic_setup` and `traffic_script`, read-only text for setting the log and the script up |

Later, because each needs something else first: revenue (a Stripe connection),
alerts that wake Pi (the deferred heartbeat), CDN cache statistics (the CDN's
analytics API).

## How it works

```mermaid
flowchart LR
  V[Visitor's browser] -->|pages| P[Proxy: Caddy, nginx or Traefik]
  V -->|/_hv/e/… events, if the script is on| P
  P --> A[Application]
  P --> L[(Access log on the server, rotated, N days)]
  L -->|fixed read-only follow over SSH; recount after gaps| W[Hallvi worker: parse → classify → count]
  W --> T[(traffic.db beside hallvi.db: day totals, collection)]
  T --> U[Traffic, Overview, Deployment, Monitoring]
  T --> Pi[Pi: read_traffic]
  L -. per open page .-> S[Live stream route] --> U
```

### Where the numbers come from

The proxy's access log is the collector. Each supported format is parsed into
one normalized request line (`TrafficLine`); everything after the parser —
classification, counting, storage, pages, Pi — never knows which proxy wrote
it. A parser boundary, not a plugin framework.

| Proxy | Format | What Pi configures |
| --- | --- | --- |
| Caddy | `caddy-json` (Caddy's own JSON access log) | The `log` directive to a rotated file readable by Hallvi's SSH user (`mode 0640`, or read through `sudo -n`); `regexp` filters that remove the query string from `request>uri` and from the `Referer` header; `log_append` fields for the kept query keys |
| nginx (and Nginx Proxy Manager, SWAG, OpenResty) | `hallvi-json` | A `log_format hallvi escape=json` emitting Hallvi's line — path and referrer without their query strings, kept keys as fields — and an `access_log` of its own beside any the owner already has |
| Traefik | `traefik-json` | JSON access log to a file, keeping the headers Hallvi needs; Traefik cannot rewrite fields, so its raw log keeps full URLs and the query strings are dropped when read |

Anything else is shown as unavailable. A proxy the owner already had keeps its
own log untouched: Hallvi adds its own beside it.

Every source must support three operations, or it gives live data and no
history: **list** the retained log files oldest first with the time each
covers, **read** a time range, and **follow** new lines. File sources cover
Caddy's own rotation (`access-<UTC ms>-size|time|manual.log.gz`) and logrotate's
(`access.log.1`, `access.log.2.gz`); container sources use
`docker logs --since/--until`. Commands stay fixed in Hallvi's code; a record
supplies only closed-shape values (a path, a container name, a time).

### Recount, never add

A day's numbers are a function of that day's log lines and nothing else.

- **Finished days** are recounted from the retained files once the day is over
  (after a short grace for requests still being written, with the log listed
  again then, so a log that was empty when the follow began is not
  forgotten) and stored as final, with their coverage. Only that recount
  makes a day final. A recount and a
  stored day are compared by the stretches of the day each covers, never by
  how long: the recount replaces a stored day it covers all of; a stored day
  that covers all of the recount and more (the log has since rotated part of
  it away) is kept; otherwise each hour comes from whichever covers it, with
  that side's gaps, and figures that are not hourly — visitors, lists, time on
  page, page speed — take the larger of the two counts: a floor, never a sum.
  The day names those figures (`partial`), and every page and Pi read them
  so: counts as "at least", time on page and page speed as measured on part
  of the views.
- **Today** is recounted from the log whenever the collector starts or
  reconnects, then kept current in memory from the follow and written as
  provisional every few seconds. The follow reads exactly the files it
  measured coverage by — the file being written checked again once `tail`
  holds it; a rotation between the listing and the follow starts it over,
  and a file it cannot read is a gap. The follow says where its backlog ends,
  and until that much is read the collection says it is catching up, with
  what it is reading, and writes nothing: a half-counted today is never shown
  as live. The follow is compressed, since its backlog is most of a day of
  JSON.
- Nothing is ever added to a saved number, so a restart cannot count twice. A
  glitch in the live follow only touches today's provisional numbers and is
  corrected when the day is recounted.
- Visitor estimates are made in memory during one pass. Hallvi stores no
  address, no user agent, no hash and no salt.

**Coverage is measured, not assumed.** The oldest line actually retained
decides how far back a recount can reach — Caddy keeps its file count *or*
its age limit, whichever runs out first — and a day that could not be read in
full says which part is missing and why (Hallvi was off, the log had rotated
away, the log was unreadable). Charts draw a gap as a gap, never as zero.

### Counting

- **A view** is a real browser navigation to a page: `GET`, 2xx or 304,
  `Sec-Fetch-Dest: document`, answered with HTML (or, when the log has no
  content type, not a file such as `.js`, `.webp` or `.pdf`), not a prefetch
  or prerender (`Sec-Purpose`/`Purpose`). An image or script opened in a tab
  is a request, not a view. Without fetch metadata, an HTML response to a
  browser-shaped request.
- **Bots and scanners** — known crawler agents, self-declared bots, browser
  agents that a modern browser's fetch metadata gives away as imitations, and
  probes for `/wp-login.php`, `/.env` and the like — are counted as their own
  line and never as visitors. Tools and API clients (`curl`, libraries, SDKs)
  are requests: neither bots nor visitors. `classify.ts` holds the rules.
- **Hallvi's own requests** (its access check, `/_hv/s.js`, the `/_hv/e/`
  events themselves) are never requests or views.
- **A visitor estimate** is a distinct browser (address and user agent) within
  one day. It is always labelled an estimate: shared connections merge
  visitors, changing networks split them, headless browsers look like people.
- **Countries** come from the address, looked up on Hallvi's machine in DB-IP
  Lite (CC BY 4.0; the Traffic page links to DB-IP), or from a CDN's country
  header when there is one. Only the country is kept.
- **Sources** come from the referrer's host (named for the common ones: Google,
  Hacker News, X, Reddit, GitHub, LinkedIn, ChatGPT…), overridden by
  `utm_source`; no referrer is "Direct". Campaigns come from `utm_campaign`.
- **Devices, browsers and systems** come from the user agent (and the screen
  width the script reports).

### The arithmetic

- Requests, views, errors, bot requests, goals and script errors add up over
  any range.
- **Visitor estimates exist per day only.** 7 d and 30 d show the daily series
  and "about N a day"; they never add days into a number presented as unique
  people. "About N a day" is the days' estimates over the days the log covered
  any of: a day read in part counts as a whole one, because a distinct count
  does not grow with the time it was counted over (ten browsers in half an
  hour are not five hundred a day), so a partial day can only understate it.
  The 24 h chart shows hourly estimates; its headline is today's.
- **Response times** are stored as a fixed-bucket histogram per hour
  (`LATENCY_BUCKETS_MS`); a range's percentile comes from the merged
  histogram, never from averaging percentiles. Page speed works the same way.
  A percentile past the last bound is only a floor and reads "at least".
- Top lists are stored per day with up to 1,000 entries and an "other" row,
  so a range merges them exactly — except a list the history names in
  `partialLists` (a day kept only its busiest, or was counted in parts),
  whose figures are floors and read "at least". A day counted in parts makes
  its visitor estimate a floor too (`visitorsAtLeast`), and its time on page
  and page speed a sample (`partialSamples`). Pi's `read_traffic` writes a
  floor into the figure itself: "at least 10000".
- Days are cut in the controller's time zone, recorded with each day.

### The script

A small script the proxy serves on the application's own domain at
`/_hv/s.js`. It sends events as requests to `/_hv/e/1/<payload>`, which the
proxy answers with `204` and logs like any other request; the payload is
base64url JSON in the **path**, so stripping query strings never touches it and
every proxy records it. No collector service, no endpoint of Hallvi's on the
internet, no cookies and nothing stored in the browser.

- **Events:** `view` (including single-page route changes), `ping` (every 30 s
  while the tab is visible — what "open right now" counts, until the view's
  `leave`), `leave` (visible time on the page), `goal` (`hv('signup')` or
  `data-hv-goal`), `vital` (LCP, INP, CLS) and `error` (a count, never the
  message). Each carries a random id for that one page view, so a `leave`
  joins its `view` without a cross-page visitor identifier, and the page's path — never
  its query, except for a query-routed page's key (below).
- **Installing it:** Pi's read-only `traffic_script` tool returns the file,
  its sha256, the proxy's serving snippet and the include line per stack
  ([`script.ts`](../../src/server/traffic/script.ts)); Pi writes the file and
  the proxy change through its server tools, under the permission modes.
  Traefik's router, service and Compose service names come from the
  application's existing Hallvi identity, so two applications can install
  it on the same proxy and a repeated setup reuses the same names. The script
  file and the helper's Caddyfile remain shared; removing one application's
  routing leaves those files and the other application's routing in place.
- **Getting it into the application:** a small pull request for the versioned
  include in the shared layout, or each entry point in a hand-built site,
  through Hallvi's existing operability pull requests. Preserve existing site
  controls; add a prompt, consent integration or notice only when requested.
  Software the owner does not change can use its own code-injection setting
  (Ghost has one). **Never** by
  rewriting HTML at the proxy: that changes what the application serves
  without the owner merging anything, which the
  [operating boundary](../../PRODUCT.md#operating-boundary) rules out.
- **Query-routed pages:** an application that routes pages by a query key
  (WordPress's `p`) has it as the access-log record's `pageKey`, and
  `traffic_script` adds `data-hv-page-key="p"` (that key) to the tag and to
  every include line. The shared script then sends that key and its value
  (`q`), separately from the path and nothing else of the query, and a change
  of the value alone is a new view. A value is at most 100 characters with
  no `?`, `#`, `&`, `=` or control character; the script leaves out one that
  is not, and Hallvi refuses an event carrying one. The count and the live
  view keep the value only when `q`'s key is the record's, so pages are named
  as the log names them; any other key names the page by its path alone.
- **Hash-routed pages:** Pi sets `hashRouting:true` on the existing
  access-log record only when the application uses hash routing.
  `traffic_script` then adds `data-hv-hash-routing="true"` to its include
  lines. Both `#/home` and `#!/home` path forms are supported, including new
  routes added later; initial load, route changes and back/forward each send
  one view. The event carries the route separately (`h`), and Hallvi appends
  it to the physical page name only when the record opts in.
  An empty fragment names the physical page itself, including a Back or
  Forward return from a hash route; that view carries no `h` value.
  Hash query values and secondary anchors are stripped. Ordinary anchors,
  key-value fragments (including encoded or malformed credential forms),
  malformed percent encoding and other fragment routing forms are ignored;
  an ignored fragment change keeps the current view. Decoded paths are at
  most 200 characters, with no spaces, controls, `%`, `?`, `#`, `&` or
  `=`. Path segments are retained just as history path segments are, so
  applications must keep secrets out of route paths.
  At the initial log-to-script switch, a physical page load already counted
  by the log pairs with its script view once; its historical physical page
  name stays. Subsequent views use the configured hash route.
- **Offered where it is seen, not pushed.** Nothing is said about the script
  during deployment unless the owner asks for analytics then. The Traffic page
  offers it as a checklist card near the top whenever history is counted from
  the log alone: the log's page loads and the script head two columns, and
  rows say what each sees (page loads, pages changed in the app, pages a CDN
  served, time on page, page speed). Goals require manual instrumentation;
  they are absent from the default checklist and their card appears only
  when the selected range has recorded goal events. The row the evidence points at is
  marked "this app": the application changes pages in the browser (in-page
  requests name pages, in their referrer, that were never loaded as a
  document), a CDN caches its pages (a `cdn` record with `caches-pages`), or
  otherwise time on page. "Not now" folds it to one line in place, in that
  browser, until a different reason appears, and the lists only the script
  fills still offer it when opened.
- **No double counting.** The log and the script are never added together.
  Each application has one switch point, the first script event Hallvi
  counts: before it, views and visitors come from the log; after it, only from
  the script. A page load the log counted just before the switch point and
  its own script view, up to three minutes later, are one view, paired by
  browser and page, so two tabs are never taken for one; the live view pairs
  them the same way, so an arrival is not shown twice. Requests, errors,
  response times and bots always come from the log. A request to the events'
  path that is no valid event — a failure, a forgery — is counted and shown
  as that path alone, never with its payload. The chart marks the
  switch. If events stop while browsers are still
  being served pages, the page says "script silent since …" rather than
  quietly falling back.

### Analytics controls and privacy

The plain script include starts measurement without a banner or grant callback.
It uses no cookies, browser storage or persistent visitor identifier. Each view
gets a temporary random id to join that view's events. Hallvi does not add a
consent UI unless the owner asks for one, and preserves existing site controls.

An existing site control can start the script disabled by setting
`window.hvConsent = false` before the deferred file loads. Later changes use:

```js
function setAnalyticsConsent(granted) {
  window.hvConsent = granted === true;
  window.hv?.consent?.(window.hvConsent);
}
```

Disabling sends no final beacon, stops listeners, observers and timers, and
clears the current view. Re-enabling measures the current page with a fresh id
without replaying earlier activity. Repeated enable calls do not duplicate
tracking. Prerendered pages wait until shown. The script stores no preference;
existing site controls own remembering and propagating their choice.

```mermaid
stateDiagram-v2
  [*] --> Measuring: plain include on shown page
  [*] --> Off: explicit initial false
  [*] --> Waiting: prerendered page
  Waiting --> Measuring: page shown and enabled
  Off --> Measuring: explicit enable on shown page
  Measuring --> Off: explicit disable
```

Pi's `traffic_script` result includes the file, proxy configuration, versioned
include and optional controls. Propose the smallest correct include change;
add a prompt, consent integration or privacy notice only when requested.
Never manufacture missing notice facts or claim that cookieless means
anonymous, consent-exempt or legally compliant. Raw event requests still enter
access logs with IP and browser information. Hallvi keeps traffic totals on the
controller; paths and campaign values can be retained in those totals. Keep
personal information out of paths, campaign values and goal names. Ordinary
server logs continue when browser measurement is disabled.

The tag includes the content version in its URL to avoid reusing an older
cached script. One server file serves all applications on that host, so
coordinate replacement with them, replace existing tags rather than loading
two versions, compare the served sha256 through any CDN, and test a fresh
browser. Already-open pages keep their loaded tracker until reloaded. Returning
setup text changes no live site. The first script event still sets the switch
point from ordinary page-log counts to script views; disabled views are not
reconstructed afterward.

### Collection is on by default, and a standing choice

**Keep traffic history** starts by itself the first time an application has
an `access-log` record, so a deployment with Hallvi's log is counted from its
first day. From then on it is the owner's choice, like automatic deploys:
turning it off, or deleting the totals, is remembered and never undone by the
default. An application without a log offers the choice on its Traffic page,
and keeping it drafts the log setup for Pi.

- **Setting it up** — JSON logging, retention, stripping the query string,
  serving `/_hv/` — is Pi's work on the server and goes through the
  [permission modes](../../PRODUCT.md#permission-modes). No new approval type.
- **While it runs,** the worker follows the log with a fixed read-only command
  and the Traffic page says so: collecting since when, the last line seen, how
  far back the server's log reaches.
- **Turning it off** stops the follow at once. Stored totals remain until the
  owner deletes them; the server's logs keep their own retention; Hallvi
  changes nothing on the server by itself.
- Traffic storage runs on a dedicated database thread in each process,
  separate from the thread serving application and conversation records. A
  Traffic write lock leaves those records and the caller's event loop free.
  The web process's choice and the collector's writes take the same SQLite
  write lock before reading whether collection is enabled. A concurrent stop or
  deletion therefore cannot be overwritten by an older collector observation
  or recreate deleted totals.
- **Removing the application** removes its totals.

### Privacy, in the words the product uses

"Hallvi keeps totals on this computer. The server keeps its access log for N
days, as web servers do; Hallvi removes query strings — from the address asked
for and from the referrer — before the line is written, and keeps only
campaign tags." The page says only what the setup's record says the log
removes (`queries`): with Caddy 2.5, whose header filters do nothing, that
referrers keep their queries; behind Traefik, whose log cannot be rewritten,
that it keeps full addresses; and with a record that does not say, nothing
either way. Hallvi makes no claim about consent: it says what it collects and
leaves that judgement to the owner.

The query string is where password-reset links, sign-in codes, invitations and
search terms live — and a same-site `Referer` carries the previous page's, so
`/reset?token=…` reaches the log through the next request's referrer. Pi reads
server logs when it investigates, so removing both at the source also keeps
them out of Pi's context and execution evidence. The
kept keys are `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`,
`utm_content`, `ref`, and a page key for an application that routes by query
string (WordPress's `p`, for example) when Pi knows it.

### CDNs

Cloudflare does not cache HTML by default, so page views still reach the
origin and are counted; the visitor's address and country come from
`CF-Connecting-IP` and `CF-IPCountry` in the log. Where a CDN caches pages, only
the script counts those views — its events are never cached. Cloudflare's raw
request logs are Enterprise-only, so CDN logs are not how visitors are counted.
Pi caches pages at Cloudflare with `set_cache_rule`: one rule per hostname,
recognisably Hallvi's, placed first so the owner's own rules still win, and
leaving the application's `Cache-Control` headers to decide what is kept
(a page without one is not cached; Hallvi's events never are). It never
replaces or reorders the zone's other rules and removes only its own.
It then records whether pages are cached — the fact `caches-pages`, "yes"
only once a page came back as a cache hit, otherwise "no", on the `cdn`
subject — so the Traffic page can say what the log cannot see.

### If a machine is lost

- **The application server:** totals live with Hallvi, so history survives.
  Only traffic Hallvi had not yet counted is lost with the log.
- **The machine running Hallvi:** `traffic.db` travels in
  [Hallvi's own backup](../../ROADMAP.md) with `hallvi.db`; anything newer is
  recounted from what the server's log still holds.
- Raw logs are not copied off the server: that would put visitor addresses in
  a second place to cover a rare case.

### Setting up the log

Tested on Caddy 2.11.4, nginx 1.30.5 and Traefik 3.7.13 over real SSH as
root, a sudo user and a user without sudo, and in Docker on every version the
common distributions ship (below). This is what Pi's instructions say: the
rules are in its system prompt ([`pi.ts`](../../src/server/pi.ts)), and the
exact configuration, steps, checks and record for each proxy come from its
read-only `traffic_setup` tool (`LOG_SETUP` in
[`pi-tools.ts`](../../src/server/traffic/pi-tools.ts)), so the long text is read
only when a log is being set up. Change the tested text there.

Pi reads the installed version first (`caddy version`, `nginx -v`,
`traefik version`) and the tool returns that version's text. Setting the log up
never upgrades, replaces or restarts a proxy a reload can serve: the shared dev
host's Ubuntu Caddy 2.6.2 rejected the 2.11 text once, and asking for a
host-wide upgrade to turn history on is the failure this prevents. An upgrade
is at most an optional suggestion put to the owner once. An existing
access-log record stays untouched until the new log is proved, and is then
updated in place — never retired first, never saved twice — because Overview's
live view reads it. When the proxy serves other applications, every approval
says so and names what is host-wide.

- **The record** points at the **host** path:
  `{kind:'access-log', proxy, format, source:{type:'file', path}, hosts, queries, pageKey?, retainDays}`,
  where `queries` is what that setup removes before a line is written:
  `removed` (address and referrer), `path-only` (Caddy 2.5) or `kept`
  (Traefik).
  `hosts` lists every name the application answers on (lower case, no port),
  so one proxy can serve several applications. A file source is preferred:
  `docker logs` history ends when the container is recreated. A proxy in a
  container bind-mounts the host directory at the same path. Hallvi's SSH user
  must be root, have passwordless sudo, or be able to read the files; reads
  and the live follow fall back to `sudo -n` and otherwise say which file is
  unreadable.
- **Caddy 2.11:** a `log hallvi` of its own beside the owner's, imported into each
  counted site, writing `/var/log/caddy/hallvi/access.log` with
  `roll_interval 24h`, `roll_keep 1000`, `roll_keep_for 30d`, `roll_size 100MiB`,
  `mode 0640`, `dir_mode 0755`; a `format filter` with
  `request>uri regexp \?.*$ ""`, `request>headers>Referer regexp [?#].*$ ""`,
  `resp_headers>Location regexp [?#].*$ ""` and `delete` for the other response
  headers that can carry the requested address (Content-Location, Link,
  Refresh, htmx's Hx-Location, Hx-Redirect, Hx-Push-Url, Hx-Replace-Url),
  wrapping json (in `fields {}` on 2.6 and 2.7); `log_append hv_<key> {query.<key>}` for each kept key, and
  `hv_page` only where the application routes by a query key. Rotated names
  carry the reason (`access-<UTC ms>-size|time|manual.log.gz`), rotation is
  lazy, and `.zst` is not read.
- **Older Caddy** lacks, by version (checked with `caddy validate`/`adapt` on
  each `caddy:<version>` image): `roll_interval` and `dir_mode` before 2.11;
  `mode` before 2.9, and 2.8 and older **ignore it without a word**, as they do
  any unknown `output file` option; `log_append`, filters written directly in
  `format filter` (rather than in `fields {}`) and two logs in one site before
  2.8 — on 2.6 and 2.7 a second `log` in a site block silently **replaces the
  owner's**; named site logs from 2.7; the `regexp` filter from 2.5, and on 2.5
  it does not apply to a header. Debian 12 and 13 and Ubuntu 24.04 to 26.04 ship
  2.6.2, EPEL 9 and Alpine 3.18 2.6.4, Alpine 3.20 2.7.6.
  - **2.8 to 2.10:** the 2.11 text with `roll_disabled` for its writer.
  - **2.6 and 2.7:** a named `log hallvi` in the global options with
    `include http.log.access`, taking every logging site's lines (host-wide,
    `hosts` picks the application's); a site without a log of its own imports
    `log { output discard }` to turn its lines on. With no `log_append`, the
    `request>uri` regexp `^([^?]*)|([?&](?:<kept keys>)=[^&]*)|(\?)[^&]*|&[^&]*`
    → `$1$2$3` keeps the campaign tags in the path's query and removes every
    other key; the reader takes them from there.
  - Both: the file is made first (`install -m 0640 -o <Caddy's user> -g adm`),
    because Caddy keeps an existing file's mode and `caddy validate` as root
    would otherwise create it root's; logrotate `copytruncate` rolls it daily
    (Caddy writes with `O_APPEND`, so no holes), losing the lines written in
    the instant of the copy. 2.5 works with the 2.6 text, but its file keeps
    referrers' queries and no Content-Type; before 2.5 the path cannot be
    filtered and the address is logged where the reader does not look, so it
    is not counted. Proved end to end with Debian 12's and Ubuntu 24.04's own
    package running as `caddy`: reload, three rotations, the owner's log
    intact, every line in the files and none carrying a removed key, and the reader's
    listing as a non-root `adm` user.
- **nginx:** Hallvi's log in **its own directory** (`install -d -m 0755
  /var/log/nginx/hallvi` first), a `conf.d/hallvi-log.conf` with maps that cut
  `$request_uri` and `$http_referer` at `?`/`#` and pick each host's page key,
  `log_format hallvi escape=json` emitting the `hallvi-json` line, and an
  `access_log … hallvi;` in every `server` block that already has its own
  (such a block inherits none from `http`). An SPA fallback
  `try_files $uri /index.html` drops the query on its internal redirect, so
  `$arg_utm_*` came out empty on route loads; it becomes
  `/index.html?$args`. Retention in
  `/etc/logrotate.d/hallvi-nginx` (root-owned, 0644): daily, 30 kept,
  compress + delaycompress, `nodateext`, `create 0640 root adm`, and a
  postrotate USR1 to nginx — without it nginx keeps writing into the renamed
  file. The same text runs unchanged on nginx 1.14 (RHEL 8) to 1.30; before
  1.11.8 there is no `escape=json` and the log is not counted.
- **Traefik:** JSON access log to `/var/log/traefik/access.log` with header
  mode `drop` except User-Agent, Referer, Sec-Fetch-Dest, Sec-Fetch-Mode,
  Sec-Purpose, Purpose, Content-Type, Cf-Connecting-Ip and Cf-Ipcountry —
  spelled canonically, because Traefik 2.0 matches names letter for letter; the
  same logrotate block with a USR1 to Traefik. Field names are the same from
  2.0 to 3.7. Its access log is static configuration, so turning it on is a
  restart of every application behind it, said as such.

What went wrong when it was tried, so Pi does not repeat it: a Hallvi file
inside `/var/log/nginx/*.log` duplicates Debian's own logrotate entry and makes
logrotate skip the owner's whole nginx configuration; logrotate ignores a
configuration not owned by root; nginx's `$uri` is rewritten by `try_files`
(an SPA route was logged as `/spa/index.html`), so the path comes from
`$request_uri`; Caddy without `mode`/`dir_mode` writes files only root can read;
Caddy still writes a failed request's error entries, **with the full query
string**, to its default logger (stderr, `docker logs`), which Pi may read;
Caddy logs response headers whole, and Paperless's sign-in redirect
(`Location: /accounts/login/?next=<path and query>`) carried the request's
query into Hallvi's log until the Location filter; nginx's `hallvi-json` line
and Traefik's keep list never log Location (checked on nginx 1.14 and 1.30,
Traefik 2.0 to 3.7); a single-file bind mount goes stale when the file is
replaced.

## Where it shows

All of it reads stored totals immediately; none of it waits for Pi.

- **Traffic** (new destination, listed once collection is on or totals exist):
  the live map and arrivals, the range switch, the charts with deploy markers
  and gaps, the breakdowns, errors with visitors affected, coverage, the
  script offer and the DB-IP credit.
- **Overview:** the lead card — today's estimated visitors against a usual
  day, thirty days of bars with each release marked on its day, what today's
  visitors opened and where they came from, and a live pulse. Server errors
  sit in the facts under it, red only when a visitor saw one.
- **Deployment:** on each release, what changed in the two hours after it
  against the two before, leaving out the hour the release fell in so a
  failure before it is never counted after it — "errors on /checkout 0 → 14, about 9 visitors" —
  and nothing when nothing changed. The hours actually compared travel with
  it (`compared`), to the line's title, the question it asks and Pi.
- **Monitoring:** requests, errors and response times from the same totals,
  instead of asking Pi to read a day.

**The look.** Light surfaces, soft motion, few words; countries glow on the
map by their share of the day, and a visit brightens its country (the owner
chose this "country tint" on 29 September 2026). Little Server stops by for nice moments — a first visitor, a new
country, a record day — briefly, then leaves. Amber and red only for what
needs the owner ([calm by default](../../src/components/hallvi/DESIGN.md)).
Treatments are chosen from switchable prototypes on the real pages, shown
only outside a production build.

## Proof

1. **Collection experiment** on a real Caddy application: stop Hallvi, send
   known traffic, rotate the log, delete a file, restart twice; stored totals
   equal an independent count of the raw files, nothing changes across
   restarts, and the deleted stretch reads as a gap.
2. **A Caddy site, an existing nginx setup, and a single-page application
   behind a Cloudflare "cache everything" rule.**
3. **The development applications seeded through the real pipeline:** a
   generator writes realistic history into each application's log and sends
   live traffic; the numbers on screen come from the counting code. Nothing is
   written into the databases directly. Outside a production build, the
   Traffic page's preview panel starts the same live traffic against the
   application's public address for a few minutes. The requests are real
   and come from one machine, so they count in that application's totals
   from one country. Its SPA shape synthesizes script events with one view
   identity per route and one initial document load; it does not execute
   the application's JavaScript. The script's browser tests establish
   actual instrumentation behavior. The separate Traffic UI fixtures show
   imagined states for visual review and do not establish traffic counts.
4. **No double counting:** page loads with the script, in-app route changes and
   `curl` requests produce exactly the expected views and requests.
