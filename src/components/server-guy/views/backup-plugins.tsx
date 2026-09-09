import type { BackupPluginEvidence } from "@/server/backup-plugin-evidence";
import { Pill } from "./bits";

/**
 * The four states a plugin check can end in, in the order a reader wants
 * them: what works, what needs something this application does not run, and
 * what was only loaded. Module integrity is never functional verification,
 * so "Module checked" keeps its own quiet grey.
 */
const states = [
  { key: "verified", label: "Function tested", tone: "ok" },
  { key: "limited", label: "Needs setup", tone: "warn" },
  { key: "loaded", label: "Module checked", tone: "muted" },
  { key: "not-verified", label: "Not verified", tone: "warn" },
] as const;

/**
 * Nine plugins, each with a state and a sentence, is nine sentences to read
 * when three of them are identical by construction. Plugins are grouped by
 * what their check established; a group whose members all recorded the same
 * result states it once and lists the names, and any group whose members
 * differ keeps every plugin's own limitation on its own row.
 */
export function BackupPlugins({
  plugins,
  counts,
}: {
  plugins: BackupPluginEvidence[];
  counts?: { total: number; moduleServed: number };
}) {
  if (!plugins.length) return null;
  const groups = states
    .map((state) => ({
      ...state,
      items: plugins.filter((plugin) => plugin.state === state.key),
    }))
    .filter((group) => group.items.length > 0);
  return (
    <section aria-label="Installed plugin checks">
      <div className="sg-band-head">
        <h3 className="sg-subheading">Installed plugins</h3>
        {counts && (
          <span className="sg-visual-caption">
            {counts.moduleServed} of {counts.total} matched their archived
            module hash
          </span>
        )}
      </div>
      <div className="sg-plugin-groups">
        {groups.map((group) => {
          const shared = group.items.every(
            (plugin) => plugin.detail === group.items[0].detail,
          )
            ? group.items[0].detail
            : null;
          return (
            <div className="sg-plugin-group" key={group.key}>
              <p className="sg-plugin-group-head">
                <Pill tone={group.tone}>{group.label}</Pill>
                <span className="sg-plugin-count">{group.items.length}</span>
                {shared && <span>{shared}</span>}
              </p>
              <ul className={shared ? "sg-plugin-names" : "sg-plugin-list"}>
                {group.items.map((plugin) => (
                  <li key={plugin.key}>
                    <strong>
                      {plugin.label}
                      {plugin.version ? (
                        <span className="sg-op-muted"> {plugin.version}</span>
                      ) : null}
                    </strong>
                    {shared ? null : <span>{plugin.detail}</span>}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
