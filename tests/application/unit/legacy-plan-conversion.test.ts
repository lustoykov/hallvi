import { expect, it } from "vitest";
import golden from "../fixtures/legacy-plan-golden.json";
import {
  convertPlan,
  legacyReleaseId,
} from "../../../scripts/retire-preparation.mjs";
import {
  assertApprovedRelease,
  releaseIdentityHolds,
  releaseOf,
  type DeploymentRelease,
} from "../../../src/server/deployment-release";
import type { DeploymentRecord } from "../../../src/server/deployment-types";
import { beginDeploymentAttempt } from "../../../src/server/deployment-lifecycle";
import { rollbackSelection } from "../../../src/server/rollback";
import { nativeApp } from "../../fixtures/native";
import { executableCompose } from "../../../src/server/native-compose";
import {
  managedDatabaseProcedure,
  nativeFacts,
} from "../../../src/server/release-facts";

// The golden file was written by the retired renderer before its deletion:
// what it rendered for representative plans, their release identities, and
// the facts every consumer read. The one-time conversion must reproduce them.
type Compose = {
  services: Record<string, Record<string, unknown>>;
  volumes: Record<string, unknown>;
};
const project = `sg-${golden.deploymentId.slice(0, 8)}`;

/** The retired renderer's short syntax, read the way Compose reads it. */
function asNative(compose: Compose) {
  const port = (value: string) => {
    const [spec, protocol = "tcp"] = value.split("/");
    const parts = spec.split(":");
    return {
      target: Number(parts.at(-1)),
      published: parts.at(-2),
      protocol,
    };
  };
  const mount = (value: string) => {
    const [source, target, mode] = value.split(":");
    return {
      type: /^[./]/.test(source) ? "bind" : "volume",
      source,
      target,
      ...(mode === "ro" ? { read_only: true } : {}),
    };
  };
  return {
    name: project,
    services: Object.fromEntries(
      Object.entries(compose.services).map(([name, service]) => {
        const next: Record<string, unknown> = { ...service };
        if (service.ports) next.ports = (service.ports as string[]).map(port);
        if (service.volumes)
          next.volumes = (service.volumes as string[]).map(mount);
        const build = service.build as
          { context: string; dockerfile: string } | undefined;
        // Native bundles hold the repository at the project root.
        if (build)
          next.build = {
            ...build,
            context: build.context.replace(/^\.\/source\//, ""),
          };
        // Only the web container was ever attributed by revision label.
        if (name !== "app" && service.labels) {
          const labels = { ...(service.labels as Record<string, string>) };
          delete labels["server-guy.revision"];
          next.labels = labels;
        }
        return [name, next];
      }),
    ),
    volumes: Object.fromEntries(
      Object.keys(compose.volumes).map((name) => [
        name,
        { name: `${project}_${name}` },
      ]),
    ),
  };
}

const convert = (plan: unknown) =>
  convertPlan(plan, {
    deploymentId: golden.deploymentId,
    repository: golden.repository,
    revision: golden.revision,
  });

it.each(golden.cases.map((item) => [item.name, item] as const))(
  "converts the %s plan with its identity, facts and executable Compose",
  (_name, item) => {
    const native = convert(item.plan);
    expect(native.converted).toEqual({
      from: "deployment-plan",
      schema: 14,
      digest: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    // The historical identity is validated from the plan, never recomputed
    // from the converted content.
    expect(legacyReleaseId(golden.repository, golden.revision, item.plan)).toBe(
      item.releaseId,
    );
    const facts = nativeFacts(native);
    const { variables, inputs, ...rest } = facts;
    const {
      variables: legacyVariables,
      inputs: legacyInputs,
      ...legacy
    } = item.facts as unknown as typeof facts;
    // Facts read today carry what the retired renderer never projected: each
    // service's image reference, and the managed database's volume as a
    // declared dump owned by its service, with the default procedure.
    const without = <T extends object>(value: T, keys: string[]) =>
      Object.fromEntries(
        Object.entries(value).filter(([key]) => !keys.includes(key)),
      );
    const declaration = ["owner", "capture", "procedure"];
    expect({
      ...rest,
      services: rest.services.map((service) => without(service, ["image"])),
      volumes: rest.volumes.map((volume) => without(volume, declaration)),
    }).toEqual({
      ...legacy,
      volumes: legacy.volumes.map((volume) => without(volume, declaration)),
    });
    for (const volume of facts.volumes)
      if (volume.name === facts.database?.volume)
        expect(volume).toMatchObject({
          owner: facts.database.service,
          capture: "dump",
          procedure: managedDatabaseProcedure,
        });
      else
        expect([volume.owner, volume.capture]).toEqual([
          undefined,
          legacy.volumes.find((v) => v.name === volume.name)?.capture,
        ]);
    expect(inputs).toEqual([...legacyInputs].sort());
    // Native facts list every service's environment names, including the
    // managed database's own; the retired projection listed the plan's.
    expect(variables).toEqual(expect.arrayContaining(legacyVariables));
    const values = item.values as unknown as Record<string, string>;
    expect(
      JSON.parse(
        executableCompose(
          native,
          values,
          item.rollbackImages as unknown as Record<string, string>,
        ),
      ),
    ).toEqual(asNative(item.rollback.compose as unknown as Compose));
    expect(JSON.parse(executableCompose(native, values))).toEqual(
      asNative(item.build.compose as unknown as Compose),
    );
    expect(
      native.files.map((file) => ({
        path: file.path,
        mode: file.mode,
        content: Buffer.from(file.content, "base64").toString("utf8"),
      })),
    ).toEqual(
      expect.arrayContaining(
        item.build.files.map((file) => ({
          ...file,
          path: file.path.replace(/^source\//, ""),
        })),
      ),
    );
    expect(native.files).toHaveLength(item.build.files.length);
  },
);

it("keeps private values as references and never stores them", () => {
  for (const item of golden.cases) {
    const text = JSON.stringify(convert(item.plan));
    for (const value of Object.values(item.values))
      expect(text).not.toContain(value);
  }
  const bindings = convert(
    golden.cases.find((item) => item.name === "postgres-connection-bindings")!
      .plan,
  );
  expect(bindings.resolved.services.worker.environment).toMatchObject({
    PGPASSWORD: "${SERVER_GUY_DATABASE_PASSWORD}",
    PGHOST: "postgres",
    QUEUE_PASSWORD: "${QUEUE_PASSWORD}",
  });
  expect(bindings.inputs).toEqual(["QUEUE_PASSWORD"]);
});

it("refuses a plan whose private-input binding has no source", () => {
  const plan = structuredClone(
    golden.cases.find((item) => item.name === "queue-worker")!.plan,
  ) as { inputBindings: { input?: string }[] };
  plan.inputBindings[0].input = "MISSING_INPUT";
  expect(() => convert(plan)).toThrow(/has no value source/);
});

const digest = (c: string) => `sha256:${c.repeat(64)}`;
it("keeps a converted release's identity only while its configuration is the one the migration sealed", () => {
  const item = golden.cases.find((entry) => entry.name === "postgres")!;
  const record = {
    id: golden.deploymentId,
    applicationId: "app",
    status: "live",
    repository: golden.repository,
    revision: golden.revision,
    releaseId: item.releaseId,
    native: convert(item.plan),
    serverId: 7,
    address: "203.0.113.7",
    events: [],
  } as unknown as DeploymentRecord;
  const release = releaseOf(record)!;
  // Unchanged, it is the release its approvals and receipts named.
  expect(release.id).toBe(item.releaseId);
  expect(releaseIdentityHolds(release)).toBe(true);
  expect(() => assertApprovedRelease(record)).not.toThrow();

  // Changing what would execute afterwards makes it other content, so the
  // historical identity no longer authorizes a deployment attempt.
  const changed = structuredClone(record);
  changed.native!.resolved.services.app.command = ["sh", "-c", "exit 0"];
  const tampered: DeploymentRelease = { ...release, native: changed.native! };
  expect(releaseOf(changed)!.id).not.toBe(item.releaseId);
  expect(releaseIdentityHolds(tampered)).toBe(false);
  expect(() => assertApprovedRelease(changed)).toThrow("release changed");
  expect(() => beginDeploymentAttempt(changed, "recreate", "op")).toThrow(
    "release changed",
  );

  // Rollback selects a retained converted release only while it holds.
  const current = releaseOf({
    repository: golden.repository,
    revision: "b".repeat(40),
    native: nativeApp({
      deploymentId: golden.deploymentId,
      revision: "b".repeat(40),
      port: 8000,
      postgres: "16",
      checks: [],
    }),
  })!;
  const hostId = `host:${golden.deploymentId}`;
  const withHistory = (retained: DeploymentRelease) =>
    ({
      ...record,
      native: current.native,
      revision: current.revision,
      releaseId: current.id,
      serviceImages: { app: digest("2"), postgres: digest("3") },
      lifecycle: {
        host: {
          id: hostId,
          provider: "hetzner",
          connectionId: null,
          serverId: 7,
          address: "203.0.113.7",
        },
        releases: [retained, current],
        attempts: [],
        verifiedImages: [
          {
            attemptId: "attempt-1",
            releaseId: retained.id,
            hostId,
            checkedAt: "2026-09-10T08:00:00Z",
            images: { app: digest("1"), postgres: digest("3") },
          },
        ],
        runtime: {
          state: "verified",
          lastVerified: {
            attemptId: "attempt-2",
            releaseId: current.id,
            hostId,
            revision: current.revision,
            checkedAt: "2026-09-10T09:00:00Z",
            images: { app: digest("2"), postgres: digest("3") },
          },
        },
      },
    }) as unknown as DeploymentRecord;
  const evidence = "The earlier code reads and writes the same schema.";
  expect(
    rollbackSelection(withHistory(release), release.id, evidence).images,
  ).toEqual({ app: digest("1"), postgres: digest("3") });
  expect(() =>
    rollbackSelection(withHistory(tampered), tampered.id, evidence),
  ).toThrow("No previously verified images");
});
