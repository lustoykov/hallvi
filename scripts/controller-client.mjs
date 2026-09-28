// How a caller outside Hallvi's page talks to a running controller: the
// `hallvi` command's apps, exec, wait and inspect today, an adapter for
// another agent later. Nothing here formats anything for a terminal.
//
// The controller is always named: a flag, then HALLVI_CONTROLLER_URL, and
// otherwise nothing is contacted. It is never guessed from an installation,
// looked for, started, or swapped for another. It is spoken to only through
// its loopback HTTP API, whose Host and origin checks stay the controller's,
// and a redirect is refused rather than followed. Loopback is a local trust
// assumption, not a login: it says nothing about who is asking.
//
// Nothing is kept here either. A request handle is the address its outcome is
// read from, so it names the controller, the application, the conversation and
// the request key, and a fresh process can find the request again with it.
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

export const ENVIRONMENT = "HALLVI_CONTROLLER_URL";
const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const HANDLE = new RegExp(
  `^/api/applications/(${UUID})/chats/(${UUID})/requests/(${UUID})$`,
);
export const isId = (value) => new RegExp(`^${UUID}$`).test(value ?? "");

/** The states in which waiting ends: someone, or something, has to act. */
export const SETTLED = [
  "waiting-for-approval",
  "waiting-for-input",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
];

/**
 * Why a call could not do what was asked. `transient` marks a read that may
 * succeed if it is simply asked again; nothing else is retried.
 */
export class ClientError extends Error {
  constructor(code, message, { transient = false } = {}) {
    super(message);
    this.code = code;
    this.transient = transient;
  }
}

/** A controller address as its origin, or why it cannot be one. */
export function controllerOrigin(value, from) {
  let url;
  try {
    url = new URL(value);
  } catch {
    url = null;
  }
  if (
    !url ||
    url.protocol !== "http:" ||
    !LOOPBACK.includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new ClientError(
      "controller-invalid",
      `${from} is not a controller address. A controller answers only on this machine, at an address such as http://127.0.0.1:4747. Nothing was contacted.`,
    );
  return url.origin;
}

/** The named controller: the flag first, then the environment. */
function named(flag, env) {
  if (flag !== undefined) return { value: flag, from: "--controller" };
  const value = env[ENVIRONMENT]?.trim();
  return value ? { value, from: ENVIRONMENT } : null;
}

export function selectController({ flag, env = process.env } = {}) {
  const chosen = named(flag, env);
  if (!chosen)
    throw new ClientError(
      "controller-missing",
      `Name the controller with --controller http://127.0.0.1:<port> or ${ENVIRONMENT}. Hallvi does not guess one, so nothing was contacted.`,
    );
  return controllerOrigin(chosen.value, chosen.from);
}

export const requestHandle = ({
  controller,
  applicationId,
  chatId,
  requestKey,
}) =>
  `${controller}/api/applications/${applicationId}/chats/${chatId}/requests/${requestKey}`;

/**
 * The request a handle names. A controller named as well must be the same
 * one: work is never looked for on another controller.
 */
export function parseHandle(handle, { flag, env = process.env } = {}) {
  let url;
  try {
    url = new URL(handle);
  } catch {
    url = null;
  }
  const found = url && !url.search && !url.hash && HANDLE.exec(url.pathname);
  if (!found)
    throw new ClientError(
      "handle-invalid",
      "That is not a request handle. `hallvi exec` prints one, beginning with the controller's address.",
    );
  const controller = controllerOrigin(url.origin, "The handle's controller");
  const chosen = named(flag, env);
  if (chosen && controllerOrigin(chosen.value, chosen.from) !== controller)
    throw new ClientError(
      "controller-conflict",
      `${chosen.from} names ${controllerOrigin(chosen.value, chosen.from)}, but the handle belongs to ${controller}. Nothing was contacted.`,
    );
  return {
    controller,
    applicationId: found[1],
    chatId: found[2],
    requestKey: found[3],
  };
}

/** A key for a request that does not have one yet. */
export const newRequestKey = () => randomUUID();

/** Why an answer is not the one asked for, from what the controller said. */
function answerError(controller, status, data, text) {
  if (!data || typeof data !== "object")
    return status === 403 && text
      ? new ClientError("refused", text.trim())
      : new ClientError(
          "not-hallvi",
          `The server at ${controller} did not answer as a Hallvi controller (HTTP ${status}).`,
          { transient: status >= 500 },
        );
  const said = typeof data.error === "string" ? data.error : `HTTP ${status}`;
  if (status === 404)
    return new ClientError(
      data.missing === "request" ? "request-not-found" : "not-found",
      said,
    );
  if (status === 503) return new ClientError("worker-unavailable", said);
  if (status >= 500)
    return new ClientError("controller-failed", said, { transient: true });
  return new ClientError("refused", said);
}

/** Talk to one controller. Every call names it; none follows a redirect. */
export function controllerClient(controller) {
  async function call(method, path, { body, timeoutMs = 30_000, signal } = {}) {
    const limit = AbortSignal.timeout(timeoutMs);
    let status;
    let text;
    let location;
    try {
      const response = await fetch(`${controller}${path}`, {
        method,
        redirect: "manual",
        headers:
          body === undefined ? {} : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, limit]) : limit,
      });
      status = response.status;
      location = response.headers.get("location");
      text = await response.text();
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error;
      throw new ClientError(
        "unreachable",
        `The controller at ${controller} did not answer: ${limit.aborted ? "it took too long" : (error.cause?.code ?? error.message)}.`,
        { transient: true },
      );
    }
    if (status >= 300 && status < 400)
      throw new ClientError(
        "redirected",
        `The controller at ${controller} answered with a redirect${location ? ` to ${location}` : ""}. Hallvi does not follow a redirect to another destination.`,
      );
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
    return { status, data, text };
  }

  async function read(path, options) {
    const { status, data, text } = await call("GET", path, options);
    if (status === 200 && data && typeof data === "object") return data;
    // Without its worker a controller cannot read a conversation. That says
    // nothing about the work, and a restarting worker is back in seconds.
    if (status === 503)
      throw new ClientError(
        "worker-unavailable",
        `Hallvi's worker at ${controller} is not running, so this cannot be read now.`,
        { transient: true },
      );
    throw answerError(controller, status, data, text);
  }

  return {
    controller,

    /** The applications, as the home page lists them. */
    applications: async (options) =>
      (await read("/api/applications", options)).applications,

    /** One application, from the same list; missing is said, never guessed. */
    async application(applicationId, options) {
      const found = (await this.applications(options)).find(
        (application) => application.id === applicationId,
      );
      if (!found)
        throw new ClientError(
          "not-found",
          `The controller at ${controller} has no application ${applicationId}. \`hallvi apps\` lists the ones it has.`,
        );
      return found;
    },

    /** What became of a request: read, never run, never resubmitted. */
    outcome: ({ applicationId, chatId, requestKey }, options) =>
      read(
        `/api/applications/${applicationId}/chats/${chatId}/requests/${requestKey}`,
        options,
      ),

    inspection: (applicationId, options) =>
      read(`/api/applications/${applicationId}/inspection`, options),

    execution: (applicationId, executionId, options) =>
      read(
        `/api/applications/${applicationId}/executions/${executionId}`,
        options,
      ),

    /**
     * Hand a request to Pi as an ordinary follow-up, and resolve once Pi has
     * durably taken it. An answer lost on the way back is asked again under
     * the same key, which Pi recognises and never takes twice; a refusal is
     * final. When no answer arrives at all, acceptance is not known, and that
     * is what is thrown.
     */
    async send(
      { applicationId, chatId, requestKey, message },
      { signal, attempts = 3, pauseMs = 1_000 } = {},
    ) {
      let lost = "";
      for (let attempt = 1; attempt <= attempts; attempt++) {
        if (attempt > 1)
          await sleep(pauseMs * (attempt - 1), undefined, { signal });
        let answer;
        try {
          answer = await call(
            "POST",
            `/api/applications/${applicationId}/chats/${chatId}/messages`,
            {
              body: { message, requestKey, delivery: "next", origin: "cli" },
              // Pi opens the conversation before it answers.
              timeoutMs: 120_000,
              signal,
            },
          );
        } catch (error) {
          if (!(error instanceof ClientError) || !error.transient) throw error;
          lost = error.message;
          continue;
        }
        if (answer.status === 202) return { accepted: true };
        const refusal = answerError(
          controller,
          answer.status,
          answer.data,
          answer.text,
        );
        if (!refusal.transient) throw refusal;
        lost = refusal.message;
      }
      throw new ClientError(
        "acceptance-unknown",
        `Whether Pi accepted this request is not known: ${lost} Sending it again with the same request key is safe; Pi never takes one twice.`,
      );
    },
  };
}

/**
 * Follow a request until it settles, the time runs out or the signal fires.
 *
 * Only the controller's own answers decide: a read that fails is never taken
 * for idle, finished or cancelled. Failures that may pass — a restarting
 * controller or worker — are asked again for `patienceMs`, then reported with
 * the last state known. A request the caller knows Pi took, and that Pi then
 * holds neither waiting nor read, was dropped by Stop: Pi keeps no record of
 * that, so it is said from the two observations, and only then.
 */
export async function observe(
  client,
  target,
  {
    timeoutMs,
    signal,
    onChange,
    known = false,
    pollMs = 1_000,
    patienceMs = 15_000,
  } = {},
) {
  const deadline = timeoutMs === undefined ? Infinity : Date.now() + timeoutMs;
  let last = null;
  let failing = null;
  for (;;) {
    try {
      const outcome = await client.outcome(target, { signal });
      failing = null;
      last = outcome;
      known = true;
      onChange?.(outcome);
      if (SETTLED.includes(outcome.status)) return { outcome, stopped: null };
    } catch (error) {
      if (signal?.aborted) return { outcome: last, stopped: "signal" };
      // Only a waiting message can leave: what Pi has read stays in its
      // history.
      if (
        error.code === "request-not-found" &&
        known &&
        (!last || !last.operation)
      )
        return { outcome: dropped(target, last), stopped: null };
      if (!error.transient) throw Object.assign(error, { outcome: last });
      failing ??= Date.now();
      if (Date.now() - failing >= patienceMs)
        throw Object.assign(
          new ClientError(
            error.code,
            `${error.message} What became of the request is not known; it may still be running.`,
          ),
          { outcome: last },
        );
    }
    if (Date.now() >= deadline) return { outcome: last, stopped: "timeout" };
    try {
      await sleep(Math.min(pollMs, deadline - Date.now()), undefined, {
        signal,
      });
    } catch {
      return { outcome: last, stopped: "signal" };
    }
  }
}

/** A request Pi took and then no longer held: Stop removed it unread. */
function dropped(target, last) {
  return {
    applicationId: target.applicationId,
    chatId: target.chatId,
    requestKey: target.requestKey,
    status: "cancelled",
    operation: null,
    answer: null,
    answerTruncated: false,
    failure: null,
    attention: null,
    evidence: [],
    evidenceOmitted: 0,
    dropped: `Pi no longer holds this request${last ? ` (it was ${last.status})` : ""}: Stop removed it before Pi read it.`,
  };
}
