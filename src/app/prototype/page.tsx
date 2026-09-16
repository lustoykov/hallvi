import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * What is still worth looking at outside a real application.
 *
 * This used to list a reference shell and its two invented scenarios. The
 * scenarios are records now, and `npm run scenarios` serves them through the
 * pages the product actually ships: a state that only renders in a layout
 * nothing ships proves nothing about the product. What is left here is the
 * handful of screens that have no records behind them to build from.
 */
export default function PrototypeIndexPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main style={{ padding: "48px 32px", maxWidth: 720, lineHeight: 1.6 }}>
      <h1>Development previews</h1>
      <p>
        Every application state lives in{" "}
        <code>tests/fixtures/scenario-records.ts</code> and is served through
        the real pages by <code>npm run scenarios -- &lt;port&gt;</code>, which
        prints one address per scenario. Add a state there rather than starting
        a second system.
      </p>
      <ul>
        <li>
          <Link href="/prototype/little-server">Little Server</Link> — the
          mascot in every mood, which no record produces.
        </li>
      </ul>
    </main>
  );
}
