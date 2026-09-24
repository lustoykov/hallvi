// What the internet can see of this application, asked from the controller.
//
// This is the one vantage point the operator does not otherwise have. A
// command on the server answers from inside the firewall and can reach the
// application over loopback however shut the public path is; the repository
// workspace has no route to the host at all. So "it works" gathered on the
// server is not evidence that a visitor gets anything, and a port that
// refuses connections on the server's own loopback is not evidence that the
// port is shut to the world.
//
// Three separate questions, deliberately answered separately:
//
//   * what public DNS hands out for the name,
//   * what certificate is served at each of those addresses, and by whom,
//   * what an ordinary request gets back.
//
// The third one is the only one that says the application answers, and the
// second is the only one that can tell a direct origin from an edge. A
// proxied name resolves to the provider, serves the provider's certificate
// and returns the provider's error page while the origin behind it is dead;
// reporting that as a working site is the specific failure this module
// exists to prevent, so the address that actually served the certificate is
// compared against the address the application is expected to be at, and
// reported either way.

import {
  getServers,
  resolve4,
  resolve6,
  resolveCname,
} from "node:dns/promises";
import { connect as netConnect, isIP } from "node:net";
import { checkServerIdentity, connect as tlsConnect } from "node:tls";

import { HALLVI_USER_AGENT } from "./access-log";

/** Refuses a target that cannot answer the question being asked. */
function publicTarget(host: string) {
  const value = host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (
    /^(localhost|127\.|0\.0\.0\.0$|::1$|10\.|192\.168\.|169\.254\.)/.test(
      value,
    ) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(value) ||
    /^(fc|fd)[0-9a-f]{2}:/i.test(value)
  )
    throw new Error(
      `${host} is not reachable from the internet, so asking this machine about it establishes nothing about public access. Use open_server_port and its returned local URL for private access.`,
    );
  return value;
}

export interface CertificateReading {
  address: string;
  /** Whether the connection completed at all, and what went wrong if not. */
  reached: boolean;
  error: string | null;
  /** Node's own trust decision against the system roots. */
  trusted: boolean;
  trustError: string | null;
  /** Whether the certificate actually covers the name that was asked for. */
  covers: boolean;
  nameError: string | null;
  issuer: string | null;
  subject: string | null;
  altNames: string | null;
  validFrom: string | null;
  validTo: string | null;
  daysRemaining: number | null;
  protocol: string | null;
}

/** One TLS handshake, for the certificate rather than for the page. */
async function readCertificate(
  address: string,
  servername: string,
  port: number,
  signal?: AbortSignal,
): Promise<CertificateReading> {
  const blank: CertificateReading = {
    address,
    reached: false,
    error: null,
    trusted: false,
    trustError: null,
    covers: false,
    nameError: null,
    issuer: null,
    subject: null,
    altNames: null,
    validFrom: null,
    validTo: null,
    daysRemaining: null,
    protocol: null,
  };
  return new Promise((resolve) => {
    const socket = tlsConnect({
      host: address,
      port,
      servername,
      // Read the certificate even when it is wrong: an expired or mismatched
      // certificate is the answer, and a thrown connection hides it.
      rejectUnauthorized: false,
      ALPNProtocols: ["http/1.1"],
      timeout: 10_000,
    });
    const stop = () => socket.destroy();
    signal?.addEventListener("abort", stop, { once: true });
    const done = (reading: CertificateReading) => {
      signal?.removeEventListener("abort", stop);
      socket.destroy();
      resolve(reading);
    };
    socket.once("secureConnect", () => {
      const certificate = socket.getPeerCertificate(false);
      const mismatch = certificate?.subject
        ? checkServerIdentity(servername, certificate)
        : new Error("The peer sent no certificate.");
      const validTo = certificate?.valid_to
        ? new Date(certificate.valid_to)
        : null;
      done({
        ...blank,
        reached: true,
        trusted: socket.authorized,
        trustError: socket.authorized
          ? null
          : socket.authorizationError
            ? String(socket.authorizationError)
            : "The chain did not verify.",
        covers: !mismatch,
        nameError: mismatch ? mismatch.message : null,
        issuer: certificate?.issuer?.O ?? certificate?.issuer?.CN ?? null,
        subject: certificate?.subject?.CN ?? null,
        altNames: certificate?.subjectaltname ?? null,
        validFrom: certificate?.valid_from ?? null,
        validTo: validTo ? validTo.toISOString() : null,
        daysRemaining: validTo
          ? Math.round((validTo.getTime() - Date.now()) / 86_400_000)
          : null,
        protocol: socket.getProtocol(),
      });
    });
    socket.once("timeout", () =>
      done({ ...blank, error: "The handshake timed out." }),
    );
    socket.once("error", (error: Error) =>
      done({ ...blank, error: error.message }),
    );
  });
}

export type PortState = "refused" | "open" | "filtered" | "unknown";

/** Whether one TCP port answers from out here. */
async function probePort(
  address: string,
  port: number,
  signal?: AbortSignal,
): Promise<{
  port: number;
  address: string;
  state: PortState;
  detail: string;
}> {
  return new Promise((resolve) => {
    const socket = netConnect({ host: address, port, signal });
    socket.setTimeout(6000);
    const done = (state: PortState, detail: string) => {
      socket.destroy();
      resolve({ port, address, state, detail });
    };
    socket.once("connect", () =>
      done(
        "open",
        "Something accepted a connection on this port from the internet.",
      ),
    );
    socket.once("timeout", () =>
      done(
        "filtered",
        "The connection was dropped rather than refused, which is what a firewall in front of a listening port looks like. Nothing got through.",
      ),
    );
    socket.once("error", (error: NodeJS.ErrnoException) =>
      error.code === "ECONNREFUSED"
        ? done(
            "refused",
            "The connection was refused: nothing outside can use this port.",
          )
        : done("unknown", error.message),
    );
  });
}

export interface PublicAccessReading {
  checkedAt: string;
  checkedFrom: string;
  name: string | null;
  dns: {
    resolvers: string[];
    ipv4: string[];
    ipv6: string[];
    cname: string[];
    error: string | null;
  } | null;
  /** The address the application is expected to be at, when one was given. */
  expectAddress: string | null;
  /** null when nothing was expected; otherwise whether DNS agrees. */
  pointsAtExpected: boolean | null;
  certificates: CertificateReading[];
  https: {
    url: string;
    status: number | null;
    finalUrl: string | null;
    redirected: boolean;
    server: string | null;
    title: string | null;
    error: string | null;
  } | null;
  http: {
    url: string;
    status: number | null;
    location: string | null;
    redirectsToHttps: boolean;
    error: string | null;
  } | null;
  /**
   * Whether something other than the origin answered. Null means it could
   * not be told, which is not the same as "no".
   */
  edge: { fronted: boolean | null; evidence: string[] };
  ports: { port: number; address: string; state: PortState; detail: string }[];
  /** What this reading does and does not establish, in words. */
  means: string[];
}

const EDGE_HEADERS = [
  "cf-ray",
  "cf-cache-status",
  "x-amz-cf-id",
  "x-fastly-request-id",
  "x-cache",
  "x-served-by",
  "via",
];

/**
 * Ask the internet what it can see. `url` checks a name end to end; `ports`
 * checks that the things which must stay private are not answering. Either
 * may be given alone, and together they are one honest answer to "what does
 * an outsider get".
 */
export async function checkPublicAccess(
  params: {
    url?: string;
    /** The origin's address, so an edge in front of it can be told apart. */
    expectAddress?: string;
    /** TCP ports to try on `expectAddress`, or on the first resolved one. */
    ports?: number[];
  },
  signal?: AbortSignal,
): Promise<PublicAccessReading> {
  if (!params.url && !params.ports?.length)
    throw new Error("Give a url to check, ports to try, or both.");
  const expectAddress = params.expectAddress
    ? publicTarget(params.expectAddress)
    : null;
  if (expectAddress && !isIP(expectAddress))
    throw new Error(`"${params.expectAddress}" is not an IP address.`);
  const reading: PublicAccessReading = {
    checkedAt: new Date().toISOString(),
    checkedFrom:
      "The PC running Hallvi, over its own internet connection and its own DNS resolvers.",
    name: null,
    dns: null,
    expectAddress,
    pointsAtExpected: null,
    certificates: [],
    https: null,
    http: null,
    edge: { fronted: null, evidence: [] },
    ports: [],
    means: [],
  };

  if (params.url) {
    const url = new URL(params.url);
    if (url.protocol !== "https:" && url.protocol !== "http:")
      throw new Error("Only http and https can be checked.");
    const host = publicTarget(url.hostname);
    reading.name = host;

    // ---- What public DNS hands out. Both families: a browser prefers IPv6,
    // so an AAAA nobody verified breaks the site for the visitors who have
    // one while the IPv4 path a check used stays perfect.
    const ipv4 = await resolve4(host).catch(() => [] as string[]);
    const ipv6 = await resolve6(host).catch(() => [] as string[]);
    const cname = await resolveCname(host).catch(() => [] as string[]);
    reading.dns = {
      resolvers: getServers(),
      ipv4,
      ipv6,
      cname,
      error:
        ipv4.length || ipv6.length || cname.length
          ? null
          : "Public DNS returned no address for this name.",
    };
    if (expectAddress)
      reading.pointsAtExpected = [...ipv4, ...ipv6].includes(expectAddress);

    // ---- The certificate, per address, so the answer says which machine
    // served it. This is the whole direct-origin versus edge distinction.
    const port = Number(url.port || 443);
    for (const address of [...ipv4, ...ipv6].slice(0, 4))
      reading.certificates.push(
        await readCertificate(address, host, port, signal),
      );

    // ---- An ordinary request, the way a visitor makes one.
    const httpsUrl = `https://${url.host}${url.pathname}${url.search}`;
    try {
      const response = await fetch(httpsUrl, {
        redirect: "follow",
        signal: signal ?? AbortSignal.timeout(20_000),
        headers: { "user-agent": HALLVI_USER_AGENT },
      });
      const body = await response.text().catch(() => "");
      const title = /<title[^>]*>([^<]{1,200})/i.exec(body)?.[1]?.trim();
      reading.https = {
        url: httpsUrl,
        status: response.status,
        finalUrl: response.url || httpsUrl,
        redirected: response.url !== httpsUrl,
        server: response.headers.get("server"),
        title: title || null,
        error: null,
      };
      const marks = EDGE_HEADERS.filter((name) => response.headers.get(name));
      if (marks.length)
        reading.edge.evidence.push(
          `The answer carried ${marks.join(", ")}, which an intermediate cache adds and an origin does not.`,
        );
    } catch (error) {
      reading.https = {
        url: httpsUrl,
        status: null,
        finalUrl: null,
        redirected: false,
        server: null,
        title: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // ---- And what plain HTTP does, which is its own configuration.
    const plainUrl = `http://${url.hostname}${url.pathname}${url.search}`;
    try {
      const response = await fetch(plainUrl, {
        redirect: "manual",
        signal: signal ?? AbortSignal.timeout(15_000),
        headers: { "user-agent": HALLVI_USER_AGENT },
      });
      const location = response.headers.get("location");
      await response.body?.cancel();
      reading.http = {
        url: plainUrl,
        status: response.status,
        location,
        redirectsToHttps: Boolean(location?.startsWith("https://")),
        error: null,
      };
    } catch (error) {
      reading.http = {
        url: plainUrl,
        status: null,
        location: null,
        redirectsToHttps: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const served = reading.certificates.filter((item) => item.reached);
    if (expectAddress && served.length)
      reading.edge.fronted = !served.some(
        (item) => item.address === expectAddress,
      );
    else if (reading.edge.evidence.length) reading.edge.fronted = true;
    if (reading.edge.fronted === false)
      reading.edge.evidence.push(
        `${expectAddress} served the certificate itself, so this is the origin's own HTTPS and not an edge in front of it.`,
      );
  }

  // ---- What must stay shut. Probed from out here, because a port bound to
  // the host's own loopback refuses on the server and says nothing at all
  // about what the internet can open.
  const target =
    expectAddress ?? reading.dns?.ipv4[0] ?? reading.dns?.ipv6[0] ?? null;
  if (params.ports?.length) {
    if (!target)
      throw new Error(
        "Give expectAddress: a port has to be tried against a machine, and no address was resolved.",
      );
    for (const port of params.ports.slice(0, 12))
      reading.ports.push(await probePort(target, port, signal));
  }

  // ---- What all of that does and does not establish.
  if (reading.dns)
    reading.means.push(
      reading.dns.ipv6.length && reading.edge.fronted !== true
        ? `The name hands out IPv6 as well as IPv4. A browser will prefer ${reading.dns.ipv6[0]}, so the AAAA record has to reach a listener that answers, or visitors with IPv6 get nothing however well the IPv4 path works.`
        : "Resolving a name proves DNS, and DNS alone never proves that anything answers.",
    );
  if (reading.https?.status)
    reading.means.push(
      `The request completed with HTTP ${reading.https.status}. That is the application answering only if this status and page are what it serves; a provider error page is also a completed request.`,
    );
  if (reading.edge.fronted === true)
    reading.means.push(
      "Something in front of the origin answered. The certificate read here is that intermediary's, and none of this says the origin behind it is alive.",
    );
  if (reading.certificates.some((item) => item.trusted && item.covers))
    reading.means.push(
      "A certificate that is trusted today says nothing about renewal. Renewal is configuration plus persistent storage; verify those, and do not claim a renewal you have not watched happen.",
    );
  return reading;
}

/**
 * Whether a recorded public address still answers, for the page that offers
 * the link. Cheap, and it claims nothing beyond the moment it was asked.
 */
export async function publicUrlReachable(url: string) {
  try {
    const target = new URL(url);
    publicTarget(target.hostname);
    const response = await fetch(target, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
      headers: { "user-agent": HALLVI_USER_AGENT },
    });
    await response.body?.cancel();
    return response.status < 500;
  } catch {
    return false;
  }
}
