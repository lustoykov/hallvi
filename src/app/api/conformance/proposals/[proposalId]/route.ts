import { getConformanceProposal, getObservation } from "@/server/db";
import { handle } from "@/server/http";
import { lineDiff } from "@/server/source-proposal";
import { NotFoundError } from "@/server/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The proposal with a review diff per file against its saved base reads. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ proposalId: string }> },
) {
  return handle(async () => {
    const { proposalId } = await context.params;
    const proposal = getConformanceProposal(proposalId);
    if (!proposal) throw new NotFoundError("Proposal not found.");
    return {
      ...proposal,
      diffs: proposal.changes.map((change) => {
        const base = change.baseObservationId
          ? getObservation(change.baseObservationId)
          : null;
        const raw = base?.raw as { content?: string } | null;
        const before = typeof raw?.content === "string" ? raw.content : "";
        return {
          path: change.path,
          deleted: change.content === null,
          created: change.baseObservationId === null && change.content !== null,
          ...lineDiff(before, change.content ?? ""),
        };
      }),
    };
  });
}
