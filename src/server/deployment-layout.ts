import type { DeploymentPlan } from "./deployment-types";

/** Retain primary build fields and allow independent service builds. */
export function sourceBuilds(plan: DeploymentPlan) {
  return [
    ...(!plan.image
      ? [
          {
            name: "app",
            context: plan.context,
            dockerfile: plan.dockerfile,
            generatedDockerfile: plan.generatedDockerfile,
          },
        ]
      : []),
    ...(plan.services ?? []).flatMap((s) =>
      s.build ? [{ name: s.name, ...s.build }] : [],
    ),
  ];
}
export function serviceImage(
  plan: DeploymentPlan,
  revision: string,
  id: string,
  name: string,
  visited = new Set<string>(),
): string {
  if (visited.has(name))
    throw new Error("Image references must not form a cycle.");
  visited.add(name);
  if (name === "app") return plan.image ?? `server-guy-${id}:${revision}`;
  const service = plan.services?.find((s) => s.name === name);
  if (!service) throw new Error(`Image refers to unknown service ${name}.`);
  if (service.imageFrom)
    return serviceImage(plan, revision, id, service.imageFrom, visited);
  if (service.image) return service.image;
  if (service.build) return `server-guy-${id}-${name}:${revision}`;
  throw new Error(`Service ${name} has no image or build.`);
}

/** A named volume is one data set with potentially several readers/writers. */
export function sharedVolumes(plan: DeploymentPlan) {
  const result = new Map<
    string,
    {
      name: string;
      kind: "files" | "database";
      mounts: {
        service: string;
        target: string;
        readOnly: boolean;
        sqlite: string | null;
      }[];
    }
  >();
  for (const service of [
    { name: "app", volumes: plan.volumes ?? [] },
    ...(plan.services ?? []),
  ]) {
    for (const v of service.volumes) {
      const volume = result.get(v.name) ?? {
        name: v.name,
        kind: v.kind,
        mounts: [],
      };
      volume.mounts.push({
        service: service.name,
        target: v.target,
        readOnly: v.readOnly ?? false,
        sqlite: v.sqlite,
      });
      result.set(v.name, volume);
    }
  }
  return [...result.values()];
}
