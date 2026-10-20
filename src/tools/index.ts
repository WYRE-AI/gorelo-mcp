import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GENERATED_TOOLS } from '../generated/tools.js';
import { executeTool } from '../executor.js';
import { getCredentials } from '../client.js';
import type { GeneratedTool } from '../tool-types.js';
import { billingWritesEnabled, destructiveEnabled, selectTools, toMcpTool } from './registry.js';
import { errorResult } from './shared.js';
import type { CallToolResult } from './types.js';

export { selectTools, ToolConfigError } from './registry.js';

const BY_NAME = new Map<string, GeneratedTool>(GENERATED_TOOLS.map((t) => [t.name, t]));

/** MCP tools/list payload for the current environment. */
export function listTools(env: NodeJS.ProcessEnv = process.env): Tool[] {
  return selectTools(env).map(toMcpTool);
}

/**
 * Runs a tool. Re-checks the enabled set at call time, so a tool hidden from
 * tools/list (e.g. destructive without the flag) cannot be invoked by name.
 */
export async function dispatchToolCall(
  name: string,
  args: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env
): Promise<CallToolResult> {
  const tool = BY_NAME.get(name);
  if (!tool) return errorResult(`Unknown tool: ${name}`);
  if (!selectTools(env).some((t) => t.name === name)) {
    return errorResult(
      tool.tier === 'destructive' && !destructiveEnabled(env)
        ? `${name} is turned off. Deleting Gorelo records is off by default for this connection.`
        : tool.billingWrite && !billingWritesEnabled(env)
        ? `${name} is turned off. Changing invoices, payments and catalog items is off by default for this connection.`
        : `${name} isn't turned on for this connection.`
    );
  }
  try {
    return { content: [{ type: 'text', text: await executeTool(tool, args, getCredentials()) }] };
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
