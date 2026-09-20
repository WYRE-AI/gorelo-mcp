import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ASSET_TOOLS, handleAssetTool } from './assets.js';
import { CLIENT_TOOLS, handleClientTool } from './clients.js';
import { CONTACT_TOOLS, handleContactTool } from './contacts.js';
import { CONTRACT_TOOLS, handleContractTool } from './contracts.js';
import { handleOrganizationTool, ORGANIZATION_TOOLS } from './organization.js';
import { handleTicketTool, TICKET_TOOLS } from './tickets.js';
import { handleTimeTrackingTool, TIME_TRACKING_TOOLS } from './time-tracking.js';
import type { CallToolResult } from './types.js';

export const ALL_TOOLS: Tool[] = [
  ...TICKET_TOOLS,
  ...CLIENT_TOOLS,
  ...CONTACT_TOOLS,
  ...CONTRACT_TOOLS,
  ...ASSET_TOOLS,
  ...TIME_TRACKING_TOOLS,
  ...ORGANIZATION_TOOLS,
];

const TICKET_NAMES = new Set(TICKET_TOOLS.map((t) => t.name));
const CLIENT_NAMES = new Set(CLIENT_TOOLS.map((t) => t.name));
const CONTACT_NAMES = new Set(CONTACT_TOOLS.map((t) => t.name));
const CONTRACT_NAMES = new Set(CONTRACT_TOOLS.map((t) => t.name));
const ASSET_NAMES = new Set(ASSET_TOOLS.map((t) => t.name));
const TIME_TRACKING_NAMES = new Set(TIME_TRACKING_TOOLS.map((t) => t.name));
const ORGANIZATION_NAMES = new Set(ORGANIZATION_TOOLS.map((t) => t.name));

export async function dispatchToolCall(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  if (TICKET_NAMES.has(name)) return handleTicketTool(name, args);
  if (CLIENT_NAMES.has(name)) return handleClientTool(name, args);
  if (CONTACT_NAMES.has(name)) return handleContactTool(name, args);
  if (CONTRACT_NAMES.has(name)) return handleContractTool(name, args);
  if (ASSET_NAMES.has(name)) return handleAssetTool(name, args);
  if (TIME_TRACKING_NAMES.has(name)) return handleTimeTrackingTool(name, args);
  if (ORGANIZATION_NAMES.has(name)) return handleOrganizationTool(name, args);
  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
}
