import { z } from "zod";
import { handle } from "@/server/http";
import { parseJsonRequest } from "@/server/schemas";
import {
  backupDestination,
  saveBackupDestination,
} from "@/server/backup-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  return handle(() => backupDestination());
}
/** The owner's own storage access, entered once; never shown to Pi. */
export function POST(request: Request) {
  return handle(async () =>
    saveBackupDestination(
      await parseJsonRequest(
        request,
        z.strictObject({
          provider: z.enum(["r2", "s3"]),
          endpoint: z.string().url().max(300),
          bucket: z.string().min(3).max(63),
          region: z.string().min(1).max(32),
          accessKeyId: z.string().min(16).max(128),
          secretAccessKey: z.string().min(32).max(128),
        }),
      ),
    ),
  );
}
