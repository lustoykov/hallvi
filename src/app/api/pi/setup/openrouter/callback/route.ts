import { openRouterLogin } from "@/server/openrouter-login";

export const runtime = "nodejs";

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

/**
 * OpenRouter sends the browser here with a code. The tab was opened by the
 * Hallvi page that is waiting for it, so it only has to say how it went and
 * close itself.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  let saved = false;
  let message: string;
  try {
    const attempt = await openRouterLogin.finish(
      url.searchParams.get("attempt") ?? "",
      url.searchParams.get("code"),
    );
    saved = attempt.state === "complete";
    message = attempt.message;
  } catch (error) {
    message = error instanceof Error ? error.message : "Nothing was saved.";
  }
  const title = saved ? "OpenRouter connected" : "OpenRouter wasn’t connected";
  const body = saved
    ? "You can close this tab and go back to Hallvi."
    : message;
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)} · Hallvi</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f7fb;color:#192338;font:15px/1.5 system-ui,sans-serif}main{max-width:420px;padding:28px 32px;margin:16px;background:#fff;border:1px solid #d8e0ec;border-radius:14px}h1{font-size:18px;margin:0 0 6px}p{margin:0;color:#536078}</style></head>
<body><main><h1>${escape(title)}</h1><p>${escape(body)}</p></main>${saved ? "<script>setTimeout(()=>window.close(),900)</script>" : ""}</body></html>`,
    {
      status: saved ? 200 : 400,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}
