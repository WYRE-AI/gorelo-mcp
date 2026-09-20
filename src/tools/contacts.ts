import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getContact, getCredentials, listContacts } from '../client.js';
import type { CallToolResult } from './types.js';
import { errorResult, requireCredentials, textResult } from './shared.js';

export const CONTACT_TOOLS: Tool[] = [
  {
    name: 'gorelo_list_contacts',
    description:
      'List contacts for the service provider, cursor-paginated, optionally filtered by client, sorted by contact id ascending.',
    inputSchema: {
      type: 'object',
      properties: {
        clientId: { type: 'number', description: 'Filter to a single client.' },
        cursor: { type: 'string', description: 'Opaque pagination cursor from a previous page; omit for the first page.' },
        pageSize: { type: 'number', description: 'Items per page, clamped 1-200 (default 50).' },
        clientIds: { type: 'array', items: { type: 'number' } },
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
    name: 'gorelo_get_contact',
    description: 'Get a single contact by id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number' } },
      required: ['id'],
    },
  },
];

export async function handleContactTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'gorelo_list_contacts') {
      const result = await listContacts(creds!, {
        clientId: args.clientId as number | undefined,
        cursor: args.cursor as string | undefined,
        pageSize: args.pageSize as number | undefined,
        clientIds: args.clientIds as number[] | undefined,
        statusIds: args.statusIds as number[] | undefined,
        query: args.query as string | undefined,
        updatedSince: args.updatedSince as string | undefined,
        updatedBefore: args.updatedBefore as string | undefined,
        createdSince: args.createdSince as string | undefined,
        createdBefore: args.createdBefore as string | undefined,
      });
      return textResult(result);
    }

    if (name === 'gorelo_get_contact') {
      const id = args.id as number;
      if (id === undefined || id === null) return errorResult('id is required.');
      return textResult(await getContact(creds!, id));
    }

    return errorResult(`Unknown contact tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
