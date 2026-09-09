import { Check, Cube, Pulse, ChartBar } from "@phosphor-icons/react";
import s from "./home.module.css";

export function applicationKind(source: string, name: string) {
  const identity = `${source} ${name}`.toLowerCase();
  if (identity.includes("uptime-kuma")) return "uptime";
  if (identity.includes("grafana")) return "metrics";
  if (identity.includes("todo")) return "tasks";
  return "application";
}
export function ApplicationSymbol({ kind }: { kind: string }) {
  const Icon =
    kind === "uptime"
      ? Pulse
      : kind === "metrics"
        ? ChartBar
        : kind === "tasks"
          ? Check
          : Cube;
  return <Icon aria-hidden="true" weight="regular" />;
}

/** Miniature interface illustrations, never screenshots or live telemetry. */
export function ApplicationIllustration({ kind }: { kind: string }) {
  return (
    <div className={s.illustration} aria-hidden="true">
      <div className={s.miniBrowser}>
        <div className={s.browserBar}>
          <span>
            <i />
            <i />
            <i />
          </span>
          <small>Interface illustration</small>
        </div>
        {kind === "uptime" ? (
          <div className={s.uptimePreview}>
            <span>Monitors · Status pages</span>
            <strong>A quiet lookout.</strong>
            <div className={s.heartbeat}>
              {Array.from({ length: 28 }, (_, i) => (
                <i key={i} />
              ))}
            </div>
            <div className={s.miniFooter}>
              <span>Your services, together</span>
              <Pulse />
            </div>
          </div>
        ) : kind === "tasks" ? (
          <div className={s.taskPreview}>
            <span>Inbox · Projects</span>
            <strong>A little progress.</strong>
            {[
              "Plan something useful",
              "Make room for an idea",
              "Take the next step",
            ].map((text, i) => (
              <div key={text}>
                <i>{i === 0 && <Check />}</i>
                {text}
              </div>
            ))}
          </div>
        ) : kind === "metrics" ? (
          <div className={s.metricsPreview}>
            <span>Dashboards · Explore</span>
            <strong>The bigger picture.</strong>
            <svg viewBox="0 0 300 70" preserveAspectRatio="none">
              <path className={s.chartRule} d="M0 15H300M0 40H300M0 65H300" />
              <path
                className={s.chartLine}
                d="M0 59L16 51L28 55L46 39L60 46L79 27L98 40L120 23L140 31L161 16L183 27L200 12L224 22L243 9L266 21L287 8L300 14"
              />
            </svg>
          </div>
        ) : (
          <div className={s.genericPreview}>
            <Cube />
            <strong>A home for your app.</strong>
            <span>Conversations · Records · Services</span>
          </div>
        )}
      </div>
    </div>
  );
}
