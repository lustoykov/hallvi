import {
  createTemporaryRoot,
  removeTemporaryRoot,
} from "../temporary-root.mjs";

/**
 * A scratch directory for one live run: its SQLite file, preference snapshot
 * and Pi agent directory.
 */
export function createEvalScratch(kind: "pi-eval" | "judge") {
  return createTemporaryRoot(`/tmp/server-guy-${kind}-`);
}

/**
 * The run is over and its reports are written under tests/results/: close the
 * scratch SQLite handle first,
 * then delete the scratch directory. Nothing else is touched; the normal
 * application database and real
 * credential files are never inside a scratch root.
 */
export function releaseEvalScratch(root: string | undefined) {
  globalThis.__serverGuyDb?.$client.close();
  delete globalThis.__serverGuyDb;
  return root ? removeTemporaryRoot(root) : false;
}
