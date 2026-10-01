// Hallvi's traffic script, served by the application's own proxy at /_hv/s.js.
//
// Each thing a page view does is one request to /_hv/e/1/<event>, which the
// same proxy answers with 204 and writes to its access log; Hallvi counts the
// log. The event is base64url JSON in the path, because every proxy logs the
// path and removing query strings never touches it. The shapes are
// `ScriptEvent` in src/server/traffic/contract.ts.
//
// No cookie, nothing stored in the browser, nothing that tells people apart:
// a page view has a random id that joins its own events and nothing else.
// Measurement starts only after the site's analytics consent controls grant
// it. window.hvConsent carries a choice made before this deferred file loads;
// window.hv.consent(true/false) applies later changes, including withdrawal.
//
// What is served is this file without its whole-line comments
// (src/server/traffic/script.ts), so keep every comment on a line of its own
// and no line of a string starting with //.
(() => {
  // Included twice, or run again by a router that re-executes the head: the
  // first copy is already counting. (An element with id="hv" is not a copy.)
  if (typeof window.hv === "function") return;

  const PREFIX = "/_hv/e/1/";
  const PING_MS = 30_000;
  const KEPT = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "ref",
  ];
  const GOAL = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
  // An application that routes pages by a query key (WordPress's ?p=) names
  // it on the tag: data-hv-page-key="p", as its access-log record does. That
  // key and its value are the only part of a query a view carries; checked
  // as Hallvi checks them (PAGE_KEY_NAME, PAGE_KEY_VALUE).
  // Read now: the tag is known only while the script first runs.
  const named = document.currentScript?.getAttribute("data-hv-page-key");
  const PAGE_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(named || "")
    ? named
    : null;
  const PAGE_VALUE = /^[^\u0000-\u001f\u007f?#&=]{1,100}$/u;
  // Hash routes are explicit opt-in. Ordinary anchors and credential
  // fragments are not routes; only #/… and #!/… path forms are supported.
  const HASH_ROUTING =
    document.currentScript?.getAttribute("data-hv-hash-routing") === "true";
  const HASH_PATH = /^\/[^\u0000-\u0020\u007f%?#&=]{0,199}$/u;
  // An error thrown in a loop would otherwise be a request per frame.
  const ERRORS_PER_VIEW = 10;

  // Nothing here may break the page it measures.
  const safely =
    (run) =>
    (...args) => {
      try {
        return run(...args);
      } catch {}
    };
  const now = () => performance.now();
  const visible = () => document.visibilityState === "visible";
  const whole = (value, most) => Math.min(Math.round(value), most);
  const originOf = (url) => url.protocol + "//" + url.host;

  // The page view being counted: its id and path, how long it has been
  // visible, and whether its totals went out since it was last visible.
  let view;
  // Its page speed so far (see `init`), and the observers that measure it.
  let lcp;
  let lcpOver = false;
  let inp;
  let cls = 0;
  let shifts = false;
  let session = 0;
  let sessionStart = 0;
  let sessionEnd = 0;
  const observers = [];
  const cleanup = [];
  let tracking = false;
  let consent = window.hvConsent === true;
  let first = true;

  const on = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    cleanup.push(() => target.removeEventListener(type, handler, options));
  };

  // One event, one request. sendBeacon survives the page going away, and
  // fetch with keepalive does the same where there is no sendBeacon. The
  // address is absolute so that a <base> pointing elsewhere cannot move it.
  const send = (event) => {
    if (!consent || !tracking) return;
    const json = JSON.stringify(event);
    const path =
      PREFIX +
      btoa(String.fromCharCode(...new TextEncoder().encode(json)))
        .replace(/=+$/, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
    // Hallvi reads at most 2,000 characters. Only campaign tags can take an
    // event past that, and a view without them still counts.
    if (path.length > 2000) {
      if (event.u) send({ ...event, u: undefined });
      return;
    }
    const url = location.origin + path;
    if (!navigator.sendBeacon?.(url))
      fetch(url, { method: "POST", keepalive: true }).catch(() => {});
  };
  const emit = (t, more) =>
    view &&
    send({
      t,
      s: view.s,
      p: view.p,
      q: view.q,
      h: view.h || undefined,
      ...more,
    });

  // The page: its path, and the page key with its value when the tag names
  // one and the address carries it.
  const path = () => location.pathname.slice(0, 300);
  const keyed = () => {
    if (!PAGE_KEY) return;
    const value = new URLSearchParams(location.search)
      .get(PAGE_KEY)
      ?.slice(0, 100);
    if (value && PAGE_VALUE.test(value)) return { k: PAGE_KEY, v: value };
  };
  const hashRoute = () => {
    if (!HASH_ROUTING) return;
    // An empty fragment is the app's physical root. Keep it distinct from
    // an ignored anchor or credential fragment without sending an h value.
    if (!location.hash) return "";
    const prefix = location.hash.startsWith("#/")
      ? "#"
      : location.hash.startsWith("#!/")
        ? "#!"
        : null;
    if (!prefix) return;
    try {
      // Strip query values and secondary anchors before decoding. Reject
      // malformed/encoded key-value credentials and nested encodings too.
      const route = decodeURIComponent(
        location.hash.slice(prefix.length).split(/[?#]/, 1)[0],
      );
      if (HASH_PATH.test(route)) return prefix + route;
    } catch {}
  };

  // Where the page the browser loaded was reached from: the referrer's
  // origin, never the page it was — this site's own when the visitor came
  // from inside it, so that only a view with no referrer at all reads as a
  // direct landing. An app's referrer (android-app://…) has no origin, so its
  // scheme and host stand in for one.
  const referrer = () => {
    try {
      const origin = originOf(new URL(document.referrer));
      if (origin.length <= 200) return origin;
    } catch {}
  };

  // Campaign tags from the address: only the keys the log keeps too, never
  // the rest of the query string.
  const tags = () => {
    const query = new URLSearchParams(location.search);
    let u;
    for (const key of KEPT) {
      const value = query.get(key);
      if (value) (u ||= {})[key] = value.slice(0, 100);
    }
    return u;
  };

  const start = (landing) => {
    view = {
      s: Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join(""),
      p: path(),
      q: keyed(),
      h: hashRoute(),
      shown: 0,
      since: visible() ? now() : null,
      left: false,
      errors: 0,
    };
    // Any other view was reached from inside the application: a route
    // change, or a page brought back from the browser's memory.
    emit("view", {
      r: landing ? referrer() : originOf(location),
      u: tags(),
      w: screen.width,
    });
  };
  const shown = () =>
    view.shown + (view.since === null ? 0 : now() - view.since);

  // Where the view stands, as totals so far: its visible time and its page
  // speed. Sent whenever the tab is hidden, the page goes away or the route
  // changes — hidden is often the last moment a page gets, since a phone
  // rarely says goodbye — and again after each return, with the new totals.
  // Hallvi keeps the largest per view, so a resent figure only corrects.
  const report = () => {
    for (const [observer, handle] of observers) handle(observer.takeRecords());
    // Largest-contentful-paint ends when the page is first hidden.
    lcpOver = true;
    if (view.left) return;
    view.left = true;
    if (lcp !== undefined) emit("vital", { n: "LCP", v: whole(lcp, 120_000) });
    if (shifts && shown())
      emit("vital", { n: "CLS", v: whole(cls * 1000, 120_000) });
    if (inp !== undefined) emit("vital", { n: "INP", v: whole(inp, 120_000) });
    // Visible time only: a tab left open behind others was not being read.
    emit("leave", { e: whole(shown(), 30 * 60_000) });
  };

  // The view is over: whatever happens after this belongs to the next one.
  const end = () => {
    report();
    lcp = inp = undefined;
    cls = session = 0;
  };

  const moved = () => {
    const hash = hashRoute();
    if (
      path() === view.p &&
      keyed()?.v === view.q?.v &&
      (hash === undefined || hash === view.h)
    )
      return;
    end();
    start(false);
  };

  const hv = (name) => {
    if (typeof name === "string" && GOAL.test(name)) emit("goal", { g: name });
  };

  const observe = (type, handle, options) => {
    if (!window.PerformanceObserver?.supportedEntryTypes?.includes(type))
      return false;
    const observer = new PerformanceObserver(
      safely((list) => handle(list.getEntries())),
    );
    // Never replay performance entries from before consent (or from a
    // refused interval). Only measurements observed while allowed count.
    observer.observe({ type, buffered: false, ...options });
    observers.push([observer, handle]);
    return true;
  };

  const init = () => {
    if (!consent || tracking || document.prerendering) return;
    tracking = true;
    // Page speed, as Chrome's web-vitals defines it, reduced to what one page
    // view needs:
    // - LCP: the start of the last largest-contentful-paint, which the
    //   browser stops reporting at the first input. Only the page the browser
    //   loaded has one, only in a tab that was visible, and a prerendered
    //   page's wait starts when it was shown.
    // - CLS: shifts not caused by input, grouped into windows of shifts under
    //   a second apart and at most five seconds long; the worst window, times
    //   1000.
    // - INP: the slowest interaction. web-vitals passes over one in every
    //   fifty as an outlier; a page view rarely has fifty. Interactions under
    //   40 ms are seen only through the first input, which is always reported.
    // Each goes out with the view's leave, as it stands then.
    const shownAt =
      performance.getEntriesByType?.("navigation")[0]?.activationStart || 0;
    lcpOver = !visible();
    observe("largest-contentful-paint", (entries) => {
      const entry = entries[entries.length - 1];
      if (entry && !lcpOver) lcp = Math.max(entry.startTime - shownAt, 0);
    });
    shifts = observe("layout-shift", (entries) => {
      for (const entry of entries) {
        if (entry.hadRecentInput) continue;
        if (
          session &&
          entry.startTime - sessionEnd < 1000 &&
          entry.startTime - sessionStart < 5000
        )
          session += entry.value;
        else {
          session = entry.value;
          sessionStart = entry.startTime;
        }
        sessionEnd = entry.startTime;
        cls = Math.max(cls, session);
      }
    });
    const interactions = (entries) => {
      for (const entry of entries)
        if (entry.interactionId || entry.entryType === "first-input")
          inp = Math.max(inp || 0, entry.duration);
    };
    observe("event", interactions, { durationThreshold: 40 });
    observe("first-input", interactions);

    // Route changes inside the application. The same page again (another
    // part of the query changing, a router tidying its state) is the same
    // view. Hash changes count only with opt-in and a supported route.
    for (const name of ["pushState", "replaceState"]) {
      const original = history[name];
      const wrapped = function (...args) {
        const result = original.apply(this, args);
        safely(moved)();
        return result;
      };
      history[name] = wrapped;
      cleanup.push(() => {
        if (history[name] === wrapped) history[name] = original;
      });
    }
    on(window, "popstate", safely(moved));
    if (HASH_ROUTING) on(window, "hashchange", safely(moved));

    on(
      document,
      "visibilitychange",
      safely(() => {
        if (visible()) {
          view.since = now();
          view.left = false;
        } else {
          view.shown = shown();
          view.since = null;
          report();
        }
      }),
    );
    on(window, "pagehide", safely(end));
    // Back to a page the browser kept whole in memory: the log sees no
    // request, so this is the only place the visit shows.
    on(
      window,
      "pageshow",
      safely((event) => event.persisted && start(false)),
    );

    // "Open right now" is the views whose tab pinged lately.
    const timer = setInterval(
      safely(() => visible() && emit("ping")),
      PING_MS,
    );
    cleanup.push(() => clearInterval(timer));

    on(
      document,
      "click",
      safely((event) => {
        const goal = event.target.closest?.("[data-hv-goal]");
        if (goal) hv(goal.getAttribute("data-hv-goal"));
      }),
      true,
    );

    // A count, never the message: messages carry whatever the page held.
    const failed = safely(
      () => view.errors++ < ERRORS_PER_VIEW && emit("error"),
    );
    on(window, "error", failed);
    on(window, "unhandledrejection", failed);

    start(first);
    first = false;
  };

  const setConsent = (granted) => {
    consent = window.hvConsent = granted === true;
    if (consent) {
      init();
      return;
    }
    // Withdrawal sends nothing, including a final leave. Nothing measured
    // earlier is queued for a later grant.
    tracking = false;
    for (const close of cleanup.splice(0)) close();
    for (const [observer] of observers.splice(0)) observer.disconnect();
    view = undefined;
    lcp = inp = undefined;
    cls = session = sessionStart = sessionEnd = 0;
    shifts = false;
  };
  window.hv = safely(hv);
  window.hv.consent = safely(setConsent);

  // A prerendered page may never be shown. It counts from the moment it is.
  if (document.prerendering)
    document.addEventListener("prerenderingchange", safely(init), {
      once: true,
    });
  else safely(init)();
})();
