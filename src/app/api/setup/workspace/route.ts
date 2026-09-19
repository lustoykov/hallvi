import { handle } from "@/server/http";
import { parseJsonRequest } from "@/server/schemas";
import {
  saveWorkspaceIsolation,
  workspaceIsolationSchema,
  workspaceSettingStatus,
} from "@/server/workspace-isolation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  return handle(workspaceSettingStatus);
}
export function PUT(request: Request) {
  return handle(async () => {
    const { isolation } = await parseJsonRequest(
      request,
      workspaceIsolationSchema,
    );
    saveWorkspaceIsolation(isolation);
    return workspaceSettingStatus();
  });
}
