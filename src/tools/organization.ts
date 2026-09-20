import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, listGroups, listUsers } from '../client.js';
import type { CallToolResult } from './types.js';
import { errorResult, requireCredentials, textResult } from './shared.js';

export const ORGANIZATION_TOOLS: Tool[] = [
  {
    name: 'gorelo_list_users',
    description: 'List users (technicians) for the service provider, cursor-paginated, sorted by user id ascending.',
    inputSchema: {
      type: 'object',
      properties: {
        cursor: { type: 'string', description: 'Opaque pagination cursor from a previous page; omit for the first page.' },
        pageSize: { type: 'number', description: 'Items per page, clamped 1-200 (default 50).' },
      },
    },
  },
  {
    name: 'gorelo_list_groups',
    description: 'List the technician groups configured for the service provider.',
    inputSchema: { type: 'object', properties: {} },
  },
];

export async function handleOrganizationTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'gorelo_list_users') {
      const result = await listUsers(creds!, {
        cursor: args.cursor as string | undefined,
        pageSize: args.pageSize as number | undefined,
      });
      return textResult(result);
    }

    if (name === 'gorelo_list_groups') {
      return textResult(await listGroups(creds!));
    }

    return errorResult(`Unknown organization tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
