import type { BackupPluginEvidence } from "@/server/backup-plugin-evidence";
import { Pill, SubHeading } from "./bits";

const status = {
  verified: { label: "Function tested", tone: "ok" },
  limited: { label: "Needs setup", tone: "warn" },
  loaded: { label: "Module checked", tone: "muted" },
  "not-verified": { label: "Not verified", tone: "warn" },
} as const;

export function BackupPlugins({
  plugins,
}: {
  plugins: BackupPluginEvidence[];
}) {
  if (!plugins.length) return null;
  return (
    <section aria-label="Installed plugin checks">
      <SubHeading>Installed plugins</SubHeading>
      <div className="sg-coverage">
        {plugins.map((plugin) => (
          <div className="sg-coverage-row" key={plugin.key}>
            <div>
              <strong>{plugin.label}</strong>
              {plugin.version ? <small>Version {plugin.version}</small> : null}
            </div>
            <Pill tone={status[plugin.state].tone}>
              {status[plugin.state].label}
            </Pill>
            <span>{plugin.detail}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
