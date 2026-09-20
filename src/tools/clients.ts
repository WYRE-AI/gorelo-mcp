import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getClient, getCredentials, listClientLocations, listClients } from '../client.js';
import type { CallToolResult } from './types.js';
import { errorResult, requireCredentials, textResult } from './shared.js';

export const CLIENT_TOOLS: Tool[] = [
  {
    name: 'gorelo_list_clients',
    description: 'List clients for the service provider, cursor-paginated, sorted by client id ascending.',
    inputSchema: {
      type: 'object',
      properties: {
        cursor: { type: 'string', description: 'Opaque pagination cursor from a previous page; omit for the first page.' },
        pageSize: { type: 'number', description: 'Items per page, clamped 1-200 (default 50).' },
        statusIds: { type: 'array', items: { type: 'number' } },
        query: { type: 'string' },
        updatedSince: { type: 'string', description: 'ISO-8601 timestamp.' },
        updatedBefore: { type: 'string', description: 'ISO-8601 timestamp.' },
        createdSince: { type: 'string', description: 'ISO-8601 timestamp.' },
        createdBefore: { type: 'string', description: 'ISO-8601 timestamp.' },
      },
    },
  },
  {
    name: 'gorelo_get_client',
    description: 'Get a single client by id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number' } },
      required: ['id'],
    },
  },
  {
    name: 'gorelo_list_client_locations',
    description: 'List the locations for a given client.',
    inputSchema: {
      type: 'object',
      properties: { clientId: { type: 'number' } },
      required: ['clientId'],
    },
  },
];

export async function handleClientTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'gorelo_list_clients') {
      const result = await listClients(creds!, {
        cursor: args.cursor as string | undefined,
        pageSize: args.pageSize as number | undefined,
        statusIds: args.statusIds as number[] | undefined,
        query: args.query as string | undefined,
        updatedSince: args.updatedSince as string | undefined,
        updatedBefore: args.updatedBefore as string | undefined,
        createdSince: args.createdSince as string | undefined,
        createdBefore: args.createdBefore as string | undefined,
      });
      return textResult(result);
    }

    if (name === 'gorelo_get_client') {
      const id = args.id as number;
      if (id === undefined || id === null) return errorResult('id is required.');
      return textResult(await getClient(creds!, id));
    }

    if (name === 'gorelo_list_client_locations') {
      const clientId = args.clientId as number;
      if (clientId === undefined || clientId === null) return errorResult('clientId is required.');
      return textResult(await listClientLocations(creds!, clientId));
    }

    return errorResult(`Unknown client tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
