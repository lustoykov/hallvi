import type { Server } from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export const PANEL_URI: string;
export interface PluginOptions {
  controller?: string;
  uiUrl?: string;
  panelHtml?: string;
}
export function uiOrigin(value: string | undefined, controller: string): string;
export function createHallviServer(options?: PluginOptions): McpServer;
export function startHttp(
  options: PluginOptions,
  port: number,
): Promise<Server>;
export function main(argv?: string[]): Promise<void>;
