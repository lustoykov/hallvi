import { homedir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import { handle } from "@/server/http";
import {
  encryptionAvailable,
  exportContents,
  EXCLUDED,
  suggestPassphrase,
  writeRecoveryExport,
} from "@/server/recovery-export";
import { assertSameOrigin, parseJsonRequest } from "@/server/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What an export would contain, and whether this machine can make one.
 *
 * Answered before the owner commits to anything, because the contents are the
 * decision: this archive holds every credential the controller has, and where
 * they choose to keep the file is a judgement they can only make knowing that.
 *
 * The suggested passphrase is generated per request and never stored. It is
 * offered rather than imposed — an owner with a password manager should use
 * their own — and the one that ends up protecting an archive is whichever one
 * comes back in the POST.
 */
export async function GET() {
  return handle(async () => {
    const { entries, missing } = exportContents();
    return {
      ...(await encryptionAvailable()),
      entries,
      missing,
      excludes: EXCLUDED,
      suggested: suggestPassphrase(),
      into: join(homedir(), "Downloads"),
    };
  });
}

/**
 * Writes the archive.
 *
 * The passphrase arrives in the body and is used once. Nothing persists it:
 * not this route, not the module it calls, not a log. If the owner loses it
 * the archive is scrap, which is the property that makes it worth making.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { passphrase, directory } = await parseJsonRequest(
      request,
      z.strictObject({
        passphrase: z.string().min(16).max(512),
        directory: z.string().min(1).max(4096).optional(),
      }),
    );
    const written = await writeRecoveryExport({
      passphrase,
      directory: directory ?? join(homedir(), "Downloads"),
    });
    return written;
  });
}
