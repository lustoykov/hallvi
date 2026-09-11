import { expect, it } from "vitest";
import {
  assertReleaseScope,
  scopeDifferences,
  type ReleaseScope,
} from "../../../src/server/release-scope";
import {
  beginDeploymentAttempt,
  finishDeploymentAttempt,
} from "../../../src/server/deployment-lifecycle";
import {
  nativeFacts,
  type VolumeFacts,
} from "../../../src/server/release-facts";
import {
  releaseOf,
  type NativeConfiguration,
  type ResolvedCompose,
} from "../../../src/server/deployment-release";
import type { DeploymentRecord } from "../../../src/server/deployment-types";
import { queueNative } from "../../fixtures/queue-worker/native";

const id = "0a1b2c3d-0000-4000-8000-000000000001";
const project = "sg-0a1b2c3d";
function fixture() {
  const r = {
    id,
    status: "live",
    repository: "qa/example",
    repositoryId: 10,
    revision: "a".repeat(40),
    native: queueNative(id, "a".repeat(40)),
    serverId: 7,
    address: "203.0.113.7",
    verifiedAt: "2026-09-10T10:00:00Z",
    createdAt: "2026-09-10T09:00:00Z",
    events: [],
  } as unknown as DeploymentRecord;
  const release = releaseOf(r)!;
  const hostId = `host:${id}`;
  r.lifecycle = {
    host: {
      id: hostId,
      provider: "hetzner",
      connectionId: null,
      serverId: 7,
      address: r.address,
    },
    releases: [release],
    attempts: [],
    runtime: {
      state: "verified",
      lastVerified: {
        attemptId: "attempt-1",
        releaseId: release.id,
        hostId,
        revision: r.revision!,
        checkedAt: r.verifiedAt!,
        images: {},
      },
    },
  };
  const scope: ReleaseScope = {
    id: "scope",
    deploymentId: r.id,
    hostId,
    serverId: 7,
    address: r.address!,
    repository: r.repository,
    repositoryId: 10,
    revision: "b".repeat(40),
    baselineReleaseId: release.id,
    maxAttempts: 3,
  };
  return { r, scope };
}
/** The retained queue configuration, optionally changed. */
function facts(change: (native: NativeConfiguration) => void = () => {}) {
  const native = queueNative(id, "b".repeat(40));
  change(native);
  return nativeFacts(native);
}
/** The queue fixture as Pi could author it in native Compose. */
function native(change: (resolved: ResolvedCompose) => void = () => {}) {
  const resolved: ResolvedCompose = {
    name: project,
    services: {
      app: {
        build: { context: ".", dockerfile: "Dockerfile" },
        image: "queue-app",
        ports: [{ target: 8080, published: "80", protocol: "tcp" }],
      },
      worker: { image: "queue-app", command: ["python", "app.py", "worker"] },
      queue: {
        image: "valkey/valkey:8.1.3-alpine",
        volumes: [{ type: "volume", source: "queue-data", target: "/data" }],
      },
    },
    volumes: { "queue-data": { name: `${project}_queue-data` } },
  };
  change(resolved);
  return nativeFacts({
    format: 1,
    resolver: "docker compose 2.40.3",
    compose: ["compose.yaml"],
    files: [],
    resolved,
    inputs: ["QUEUE_PASSWORD"],
    data: [{ volume: "queue-data", kind: "database", sqlite: null }],
    database: null,
    httpAccess: "public",
    criterion: null,
    summary: "The queue fixture in native Compose",
  } satisfies NativeConfiguration);
}

it("permits corrections, new services and new data within the same authorization", () => {
  const { r, scope } = fixture();
  const corrected = facts(({ resolved }) => {
    resolved.services.app.command = ["python", "correct_entrypoint.py"];
    resolved.services.app.environment!.MODE = "production";
    resolved.services.worker.depends_on = {
      queue: { condition: "service_started" },
    };
  });
  expect(() => assertReleaseScope(r, scope, corrected)).not.toThrow();
  // Native Compose reaching the same effects needs no new decision, even
  // when it moves the container port or adds a service with its own data.
  expect(scopeDifferences(facts(), native())).toEqual([]);
  expect(
    scopeDifferences(
      facts(),
      native((c) => {
        c.services.app.ports![0].target = 8000;
        c.services.indexer = {
          image: "qa/indexer:1",
          volumes: [{ type: "volume", source: "index", target: "/index" }],
        };
      }),
    ),
  ).toEqual([]);
});

it("names every out-of-scope effect: exposure, data identity or access and the managed database", () => {
  const { r, scope } = fixture();
  const baseline = facts();
  const differences = (change: (c: ResolvedCompose) => void) =>
    scopeDifferences(baseline, native(change)).join(" ");
  expect(
    differences((c) => {
      c.services.worker.ports = [{ target: 9000, published: "9000" }];
    }),
  ).toContain("network exposure (adds worker *:9000/tcp)");
  expect(
    differences((c) => {
      c.services.web = { image: "qa/web:1", ports: c.services.app.ports };
      delete c.services.app.ports;
    }),
  ).toMatch(/adds web \*:80\/tcp.*removes app \*:80\/tcp/);
  expect(
    differences((c) => {
      c.services.app.ports![0].host_ip = "127.0.0.1";
    }),
  ).toContain("network exposure");
  expect(
    differences((c) => {
      c.volumes!["queue-data"].name = "sg-0a1b2c3d_renamed";
    }),
  ).toContain("Preserve volume queue-data");
  expect(
    differences((c) => {
      c.services.queue.volumes![0].read_only = true;
    }),
  ).toContain("Preserve volume queue-data");
  expect(() =>
    assertReleaseScope(
      r,
      scope,
      facts((native) => {
        native.httpAccess = "controller";
      }),
    ),
  ).toThrow("network exposure");
  const withDatabase = (version: "17" | "18") =>
    facts((native) => {
      native.database = { service: "postgres", version };
      native.resolved.services.postgres = {
        image: `postgres:${version}`,
        volumes: [
          { type: "volume", source: "database", target: "/var/lib/data" },
        ],
      };
      native.resolved.volumes!.database = { name: `${project}_database` };
      native.data.push({ volume: "database", kind: "database", sqlite: null });
    });
  // The managed database is a state owner like any other: its image change
  // needs the owner's decision for that service, and only its removal is a
  // separate data-change decision.
  expect(
    scopeDifferences(withDatabase("17"), withDatabase("18")).join(),
  ).toContain("Service postgres owns persistent data");
  expect(
    scopeDifferences(withDatabase("17"), withDatabase("18"), ["postgres"]),
  ).toEqual([]);
  expect(
    scopeDifferences(
      withDatabase("17"),
      facts((native) => {
        native.database = null;
      }),
    ).join(),
  ).toContain("Removing or renaming the managed database service postgres");
  expect(() =>
    assertReleaseScope({ ...r, serverId: 8 }, scope, facts()),
  ).toThrow("host changed");
});

it("keeps a declared state owner's image unless the owner approved changing it", () => {
  const owned = (image: string) => {
    const facts = native((c) => {
      c.services.queue.image = image;
    });
    facts.volumes[0].owner = "queue";
    return facts;
  };
  const pinned = (digit: string) =>
    `valkey/valkey:8.1.3-alpine@sha256:${digit.repeat(64)}`;
  const baseline = owned(pinned("a"));
  expect(scopeDifferences(baseline, owned(pinned("a")))).toEqual([]);
  expect(scopeDifferences(baseline, owned(pinned("b"))).join()).toContain(
    "Service queue owns persistent data",
  );
  expect(scopeDifferences(baseline, owned(pinned("b")), ["queue"])).toEqual([]);
});

it("keeps a volume's declared owner and capture through corrections unless the owner decides otherwise", () => {
  const owned = (change: (volume: VolumeFacts) => void = () => {}) => {
    const facts = native((c) => {
      c.services.queue.image = `valkey/valkey:8.1.3-alpine@sha256:${"a".repeat(64)}`;
    });
    Object.assign(facts.volumes[0], { owner: "queue", capture: "dump" });
    change(facts.volumes[0]);
    return facts;
  };
  const baseline = owned();
  // A correction that redeclares the volume without its owner would strip
  // its image protection and its capture on the next release.
  const unowned = owned((volume) => {
    delete volume.owner;
    delete volume.capture;
  });
  expect(scopeDifferences(baseline, unowned).join()).toContain(
    'Volume queue-data is owned by queue with capture "dump" as database; a correction keeps that declaration',
  );
  const recaptured = owned((volume) => {
    delete volume.capture;
  });
  expect(scopeDifferences(baseline, recaptured).join()).toContain(
    "propose it as a state change for queue",
  );
  // Adding protection to an unowned volume is an ordinary correction;
  // removing it is that owner's state change, and so is recording the
  // owned volume as something else.
  expect(scopeDifferences(unowned, baseline)).toEqual([]);
  expect(scopeDifferences(baseline, unowned, ["queue"])).toEqual([]);
  const asFiles = owned((volume) => {
    volume.kind = "files";
    volume.capture = "quiesced-files";
  });
  expect(scopeDifferences(baseline, asFiles).join()).toContain(
    "propose it as a state change for queue",
  );
  expect(scopeDifferences(baseline, asFiles, ["queue"])).toEqual([]);
  // An unowned volume's recorded kind still needs a separate decision.
  const plain = native();
  const relabeled = native();
  relabeled.volumes[0].kind = "files";
  expect(scopeDifferences(plain, relabeled).join()).toContain(
    "recorded kind and data path",
  );
  // Retiring an owned volume (no service mounts it any more; the named
  // volume stays on the host) is that owner's state change as well.
  const detached = native((c) => {
    c.services.queue.volumes = [];
  });
  expect(scopeDifferences(baseline, detached).join()).toContain(
    "Preserve volume queue-data, its existing consumers, access and mount. Moving existing data needs a separate decision: propose it as a state change for queue",
  );
  expect(scopeDifferences(baseline, detached, ["queue"])).toEqual([]);
  expect(scopeDifferences(plain, detached).join()).toContain(
    "Preserve volume queue-data",
  );
});

it("binds the established runtime: its own retries may supersede an observation, another authorization's may not", () => {
  const { r, scope } = fixture();
  r.revision = "b".repeat(40);
  const attempt = beginDeploymentAttempt(r, "release", "operation");
  attempt.authorizationId = scope.id;
  r.serviceImages = { app: "sha256:observed" };
  finishDeploymentAttempt(r, attempt.id, "failed", "Behavior failed", true);
  expect(r.lifecycle!.runtime.state).toBe("observed");
  expect(() => assertReleaseScope(r, scope, facts())).not.toThrow();
  const other = { ...scope, id: "another-scope" };
  expect(() => assertReleaseScope(r, other, facts())).toThrow(
    "different release",
  );
});
