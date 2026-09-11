import { expect, it } from "vitest";
import golden from "../fixtures/legacy-plan-golden.json";
import {
  convertPlan,
  legacyReleaseId,
} from "../../../scripts/retire-preparation.mjs";
import type { NativeConfiguration } from "../../../src/server/deployment-release";
import { executableCompose } from "../../../src/server/native-compose";
import { nativeFacts } from "../../../src/server/release-facts";

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
  convertPlan(
    plan,
    golden.deploymentId,
    golden.revision,
  ) as NativeConfiguration;

it.each(golden.cases.map((item) => [item.name, item] as const))(
  "converts the %s plan with its identity, facts and executable Compose",
  (_name, item) => {
    const native = convert(item.plan);
    expect(native.converted).toEqual({ from: "deployment-plan", schema: 14 });
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
    } = item.facts as typeof facts;
    expect(rest).toEqual(legacy);
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
