// A local MCP Apps host for looking at the Hallvi panel in a browser. It runs
// the real adapter over stdio against a named controller and renders the
// panel resource in a sandboxed iframe, the way Codex does, with switches for
// width, theme and display mode. It proves layout and the MCP round trip; it
// is not Codex, whose own behaviour must be checked in Codex.
import { createServer } from "node:http";
import { parseArgs } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { selectController } from "./controller-client.mjs";

const { values } = parseArgs({
  options: {
    controller: { type: "string" },
    "ui-url": { type: "string" },
    port: { type: "string", default: "3747" },
    adapter: { type: "string", default: "plugins/hallvi/server.mjs" },
  },
});
const controller = selectController({ flag: values.controller });
const client = new Client({ name: "hallvi-panel-host", version: "1" });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [
      values.adapter,
      "--controller",
      controller,
      ...(values["ui-url"] ? ["--ui-url", values["ui-url"]] : []),
    ],
    stderr: "inherit",
  }),
);

async function panel() {
  // The adapter's own update path: an edited panel.html shows on the next load.
  await client.callTool({ name: "hallvi_reload_ui", arguments: {} });
  const { tools } = await client.listTools();
  const uri = tools.find((tool) => tool.name === "hallvi_open")?._meta?.ui
    ?.resourceUri;
  const resource = await client.readResource({ uri });
  return resource.contents[0].text;
}

// Roughly the variables Codex hands an MCP app (see the MCP Apps spec's
// standard names); switchable off to see Hallvi's own fallbacks.
const STYLES = {
  light: {
    "--color-background-primary": "#ffffff",
    "--color-background-secondary": "#f9f9f9",
    "--color-background-tertiary": "#f3f3f3",
    "--color-text-primary": "#0d0d0d",
    "--color-text-secondary": "#5d5d5d",
    "--color-border-primary": "#d9d9d9",
    "--color-border-secondary": "#ececec",
    "--font-sans": 'ui-sans-serif, -apple-system, system-ui, "Segoe UI", sans-serif',
    "--font-mono": 'ui-monospace, "SF Mono", Menlo, monospace',
  },
  dark: {
    "--color-background-primary": "#181818",
    "--color-background-secondary": "#212121",
    "--color-background-tertiary": "#2a2a2a",
    "--color-text-primary": "#f3f3f3",
    "--color-text-secondary": "#afafaf",
    "--color-border-primary": "#424242",
    "--color-border-secondary": "#303030",
    "--font-sans": 'ui-sans-serif, -apple-system, system-ui, "Segoe UI", sans-serif',
    "--font-mono": 'ui-monospace, "SF Mono", Menlo, monospace',
  },
};

const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hallvi panel test host</title>
<style>
body{margin:0;font:13px system-ui;background:#e9ebef;color:#222;display:flex;flex-direction:column;height:100vh}
.bar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:8px 12px;background:#fff;border-bottom:1px solid #ddd}
.stage{flex:1;display:flex;gap:16px;padding:16px;min-height:0}
.frame{flex:none;border:1px solid #ccc;border-radius:10px;overflow:hidden;background:#fff;height:100%}
iframe{border:0;width:100%;height:100%}
.log{flex:1;min-width:220px;overflow:auto;font:11px/1.5 ui-monospace,monospace;white-space:pre-wrap;background:#fff;border:1px solid #ddd;border-radius:10px;padding:8px}
body.dark{background:#0f0f0f;color:#ddd}body.dark .bar,body.dark .log{background:#1b1b1b;border-color:#333;color:#ccc}
</style></head><body>
<div class="bar">
<b>Hallvi panel · test host</b>
<label>Width <select id="width"><option>320</option><option selected>380</option><option>480</option><option>760</option></select></label>
<label>Theme <select id="theme"><option>light</option><option>dark</option></select></label>
<label><input type="checkbox" id="styles" checked> Host styles</label>
<label>Mode <select id="mode"><option value="fullscreen">sidebar</option><option value="inline">in thread</option></select></label>
<label><input type="checkbox" id="messages" checked> ui/message</label>
<button id="reload">Reload panel</button>
</div>
<div class="stage"><div class="frame" id="frame"></div><div class="log" id="log" aria-label="Host log"></div></div>
<script>
const STYLES=${JSON.stringify(STYLES)};
const $=(id)=>document.getElementById(id);
let frame;
const log=(kind,value)=>{$('log').textContent=new Date().toLocaleTimeString()+' '+kind+' '+(typeof value==='string'?value:JSON.stringify(value,null,1)).slice(0,1600)+'\\n\\n'+$('log').textContent.slice(0,40000)};
const context=()=>({theme:$('theme').value,displayMode:$('mode').value,styles:$('styles').checked?{variables:STYLES[$('theme').value]}:undefined,containerDimensions:{maxWidth:Number($('width').value)}});
async function mount(){
  $('frame').style.width=$('width').value+'px';
  $('frame').style.height=$('mode').value==='inline'?'640px':'100%';
  document.body.classList.toggle('dark',$('theme').value==='dark');
  frame=document.createElement('iframe');
  frame.title='Hallvi';
  // ?storage=1 gives the frame an origin, for browser storage and inspecting its DOM.
  frame.setAttribute('sandbox','allow-scripts allow-forms allow-popups'+(new URLSearchParams(location.search).has('storage')?' allow-same-origin':''));
  // srcdoc, like a host's sandbox proxy: an opaque origin with no network of its own.
  frame.srcdoc=await (await fetch('/panel')).text();
  $('frame').replaceChildren(frame);
}
for(const id of ['width','mode']) $(id).onchange=mount;
for(const id of ['theme','styles']) $(id).onchange=()=>{document.body.classList.toggle('dark',$('theme').value==='dark');frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/host-context-changed',params:context()},'*')};
$('reload').onclick=mount;
window.addEventListener('message',async(e)=>{
  if(e.source!==frame.contentWindow||e.data?.jsonrpc!=='2.0')return;
  const m=e.data; if(m.id==null){log('notify',m.method);return;}
  const reply=(body)=>frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,...body},'*');
  try{
    if(m.method==='ui/initialize') return reply({result:{protocolVersion:'2026-01-26',hostInfo:{name:'hallvi-test-host',version:'1'},hostCapabilities:{},hostContext:context()}});
    if(m.method==='tools/call'){const started=performance.now();const r=await fetch('/call',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(m.params)});const result=await r.json();log('tools/call '+m.params.name+' '+Math.round(performance.now()-started)+'ms '+JSON.stringify(result).length+'B',m.params.arguments);return reply({result});}
    if(m.method==='ui/update-model-context'){log('model context',m.params.content?.[0]?.text??m.params);return reply({result:{}});}
    if(m.method==='ui/open-link'){log('open-link (ignored, as Codex does for http)',m.params.url);return reply({result:{}});}
    if(m.method==='ui/message'){if(!$('messages').checked)return reply({error:{code:-32601,message:'MCP app messages are disabled for this view'}});log('ui/message → composer',m.params.content?.[0]?.text);return reply({result:{}});}
    reply({error:{code:-32601,message:'Not supported by this test host: '+m.method}});
  }catch(err){reply({error:{code:-32000,message:err.message}});}
});
mount();
</script></body></html>`;

const server = createServer(async (req, res) => {
  // Only this page may drive the adapter: a request can send work to Pi.
  const self = `127.0.0.1:${server.address().port}`;
  if (
    req.headers.host !== self ||
    (req.headers.origin && req.headers.origin !== `http://${self}`)
  ) {
    res.writeHead(403).end("Forbidden host or origin");
    return;
  }
  try {
    if (req.url.startsWith("/panel")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(await panel());
    }
    if (
      req.url === "/call" &&
      req.method === "POST" &&
      req.headers["content-type"] === "application/json"
    ) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const result = await client.callTool(JSON.parse(raw), undefined, {
        timeout: 60_000,
      });
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(result));
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page);
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: error.message } }));
  }
});
server.listen(Number(values.port), "127.0.0.1", () =>
  console.log(
    `Hallvi panel test host: http://127.0.0.1:${server.address().port} → ${controller} (PID ${process.pid})`,
  ),
);
const stop = async () => {
  server.closeAllConnections();
  server.close();
  await client.close().catch(() => {});
  process.exit(0);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
