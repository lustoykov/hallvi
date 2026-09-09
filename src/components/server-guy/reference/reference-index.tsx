import Link from "next/link";

import "./reference.css";
import { richScenario } from "./scenario-rich";
import { simpleScenario } from "./scenario-simple";

const scenarios = [simpleScenario, richScenario];

const screens: { title: string; detail: string; href: string }[] = [
  {
    title: "Where the application identity belongs",
    detail:
      "Three placements of the switcher, side by side and live: sidebar head, top bar, or a path with no menu.",
    href: "/prototype/shell",
  },
  {
    title: "Applications",
    detail: "The list with condition, stack and what needs you.",
    href: "/prototype/applications",
  },
  {
    title: "Applications · empty",
    detail: "The first-run state before any application exists.",
    href: "/prototype/applications?state=empty",
  },
  {
    title: "Add application",
    detail: "Repository or upstream image, name, permission policy.",
    href: "/prototype/new",
  },
  {
    title: "Add application · GitHub not connected",
    detail: "The form blocks until GitHub is connected.",
    href: "/prototype/new?state=no-github",
  },
  {
    title: "Settings · Connections",
    detail: "Every provider account, its scope and state.",
    href: "/prototype/settings/connections",
  },
  {
    title: "Settings · Connections · expired",
    detail: "An expired GitHub token and a failing R2 token.",
    href: "/prototype/settings/connections?state=expired",
  },
  {
    title: "Settings · Connections · fresh install",
    detail: "Nothing connected yet.",
    href: "/prototype/settings/connections?state=fresh",
  },
  {
    title: "Settings · ChatGPT & model",
    detail: "The real screen, in its not-connected state on this server.",
    href: "/setup/pi",
  },
  {
    title: "Settings · GitHub",
    detail: "The real screen, in its not-connected state on this server.",
    href: "/setup/github",
  },
  {
    title: "Settings · Execution",
    detail: "The real screen, checking the local Docker engine.",
    href: "/setup/execution",
  },
];

const flows: { title: string; detail: string; href: string }[] = [
  {
    title: "First deployment · recommendation waiting",
    detail: "Status page · the priced recommendation in the receipt.",
    href: "/prototype/app?scenario=simple&step=2",
  },
  {
    title: "First deployment · deploying",
    detail: "Status page · steps in the receipt, work strip over Logs.",
    href: "/prototype/app?scenario=simple&step=3&section=logs",
  },
  {
    title: "Backup proposal with a protected input",
    detail: "Document archive · one token, cost and scope in the receipt.",
    href: "/prototype/app?scenario=rich&step=3",
  },
  {
    title: "Backups view · protected",
    detail: "Document archive · coverage, restore test, history.",
    href: "/prototype/app?scenario=rich&step=6&section=backups",
  },
  {
    title: "Automatic failure · nightly upload rejected",
    detail: "Document archive · issue, red mark, last good copy kept.",
    href: "/prototype/app?scenario=rich&step=7&section=overview",
  },
  {
    title: "Investigation with recovery input",
    detail: "Document archive · the adopted receipt asks for a new token.",
    href: "/prototype/app?scenario=rich&step=8",
  },
  {
    title: "Worker crash · monitoring and jobs",
    detail: "Document archive · queue backing up, evidence, one proposal.",
    href: "/prototype/app?scenario=rich&step=11&section=monitoring",
  },
  {
    title: "Release from a detected candidate",
    detail: "Document archive · offered, approved, verified.",
    href: "/prototype/app?scenario=rich&step=15&section=deployment",
  },
  {
    title: "Domain with the one DNS step",
    detail: "Document archive · pending DNS, then HTTPS live.",
    href: "/prototype/app?scenario=rich&step=19&section=domains",
  },
  {
    title: "Secret rotation",
    detail: "Document archive · a protected input, a pending restart.",
    href: "/prototype/app?scenario=rich&step=22&section=variables",
  },
  {
    title: "Host unreachable · stale, not healthy",
    detail: "Document archive · unknown checks, nothing inferred.",
    href: "/prototype/app?scenario=rich&step=25&section=overview",
  },
  {
    title: "Simple stack · what else it could run",
    detail: "Status page · adaptive sidebar with Show more.",
    href: "/prototype/app?scenario=simple&step=4&section=processes",
  },
  {
    title: "Delivery path · no domain",
    detail: "Status page · the path from name to service with the gaps shown.",
    href: "/prototype/app?scenario=simple&step=4&section=domains",
  },
  {
    title: "Disk against its volumes",
    detail: "Document archive · which volume is actually large.",
    href: "/prototype/app?scenario=rich&step=13&section=storage",
  },
  {
    title: "Recovery points over time",
    detail: "Document archive · copies, gaps and the proven restore.",
    href: "/prototype/app?scenario=rich&step=13&section=backups",
  },
];

/** The inventory: every scenario step and screen, each one link away. */
export function ReferenceIndex() {
  return (
    <main className="sg-reference-index">
      <h1>Server Guy · reference screens</h1>
      <p>
        The complete visual and interaction reference, built from the product’s
        own components with invented data. Two applications: a simple status
        page and a rich document archive. Step through each scenario with the
        bar at the bottom, or open a flow below. Nothing here touches a host, a
        provider or the database.
      </p>
      <h2>Flows worth seeing first</h2>
      <div className="sg-reference-grid">
        {flows.map((flow) => (
          <Link className="sg-reference-card" key={flow.href} href={flow.href}>
            <strong>{flow.title}</strong>
            <span>{flow.detail}</span>
          </Link>
        ))}
      </div>
      {scenarios.map((scenario) => (
        <section key={scenario.id}>
          <h2>
            {scenario.name} ·{" "}
            <Link href={`/prototype/app?scenario=${scenario.id}&step=0`}>
              open
            </Link>
          </h2>
          <p>{scenario.summary}</p>
          <ol className="sg-reference-steps">
            {scenario.steps.map((step, index) => (
              <li key={step.id}>
                <span>{index + 1}</span>
                <span>
                  {step.title}
                  <small>{step.note}</small>
                </span>
                <Link
                  href={`/prototype/app?scenario=${scenario.id}&step=${index}`}
                >
                  Open
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <h2>Other screens</h2>
      <div className="sg-reference-grid">
        {screens.map((screen) => (
          <Link
            className="sg-reference-card"
            key={screen.href}
            href={screen.href}
          >
            <strong>{screen.title}</strong>
            <span>{screen.detail}</span>
          </Link>
        ))}
      </div>
      <h2>Dialogs</h2>
      <p>
        Remove application opens from the application picker in any workspace
        screen. Edit setup and Change revision are the existing product dialogs;
        they call real endpoints and are not staged here. Check details belongs
        to the preparation record, which the reference retires from the
        workspace.
      </p>
    </main>
  );
}
