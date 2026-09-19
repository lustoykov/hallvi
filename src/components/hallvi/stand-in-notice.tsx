import styles from "./stand-in-notice.module.css";

/**
 * A copy of this app started by tests/rig looks exactly like the real one:
 * the same pages, the same agent, records that read like a real deployment.
 * Only the cloud provider and the wire to the server are stand-ins, and
 * nothing on screen said so — a rig instance on some port was mistaken for a
 * real controller and its harness failures were read as product defects.
 *
 * The rig sets SG_RIG_HOST_ROOT for the app process and nothing else does,
 * so its presence is the whole test. Read at render time; the rig runs
 * `next dev`, where the layout renders on every request.
 */
export function StandInNotice() {
  const root = process.env.SG_RIG_HOST_ROOT;
  if (!root) return null;
  const container = process.env.SG_RIG_HOST_CONTAINER;
  const server = container
    ? `the server is the Docker container ${container}`
    : "the server is this PC's own shell and Docker";
  return (
    <div
      className={styles.notice}
      role="status"
      title={`Started by tests/rig. The Hetzner API is a stand-in and ${server}. Nothing here touches a real server.`}
    >
      <span className={styles.badge}>Test harness</span>
      <span className={styles.text}>Fake cloud provider, {server}.</span>
    </div>
  );
}
