import { handle } from "@/server/http";
import {
  operatorSettings,
  operatorSettingsSchema,
  saveOperatorSettings,
  listExecutions,
} from "@/server/operator-execution";
import { parseJsonRequest } from "@/server/schemas";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ applicationId: string }> };
export function GET(_request: Request, context: Context) {
  return handle(async () => {
    const { applicationId } = await context.params;
    return {
      settings: await operatorSettings(applicationId),
      executions: await listExecutions(applicationId),
    };
  });
}
export function POST(request: Request, context: Context) {
  return handle(async () => {
    const settings = await parseJsonRequest(request, operatorSettingsSchema);
    return await saveOperatorSettings(
      (await context.params).applicationId,
      settings,
    );
  });
}
