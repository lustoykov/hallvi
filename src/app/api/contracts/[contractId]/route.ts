import { getContract } from "@/server/db";
import { handle } from "@/server/http";
import { NotFoundError } from "@/server/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ contractId: string }> },
) {
  return handle(async () => {
    const { contractId } = await context.params;
    const contract = getContract(contractId);
    if (!contract) throw new NotFoundError("Application Contract not found.");
    return contract;
  });
}
