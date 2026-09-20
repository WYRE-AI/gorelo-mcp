import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, listContracts } from '../client.js';
import type { CallToolResult } from './types.js';
import { errorResult, requireCredentials, textResult } from './shared.js';

export const CONTRACT_TOOLS: Tool[] = [
  {
    name: 'gorelo_list_contracts',
    description: 'List billing contracts, each with the service lines it is made of, cursor-paginated.',
    inputSchema: {
      type: 'object',
      properties: {
        cursor: { type: 'string', description: 'Opaque pagination cursor from a previous page; omit for the first page.' },
        pageSize: { type: 'number', description: 'Items per page, clamped 1-200 (default 50).' },
        clientIds: { type: 'array', items: { type: 'number' } },
      },
    },
  },
];

export async function handleContractTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'gorelo_list_contracts') {
      const result = await listContracts(creds!, {
        cursor: args.cursor as string | undefined,
        pageSize: args.pageSize as number | undefined,
        clientIds: args.clientIds as number[] | undefined,
      });
      return textResult(result);
    }

    return errorResult(`Unknown contract tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
