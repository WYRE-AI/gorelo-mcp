import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getAsset, getCredentials, listAssets, listCustomAssets } from '../client.js';
import type { CallToolResult } from './types.js';
import { errorResult, requireCredentials, textResult } from './shared.js';

export const ASSET_TOOLS: Tool[] = [
  {
    name: 'gorelo_list_assets',
    description:
      'List agent (managed device) assets for the service provider, cursor-paginated, newest-created first.',
    inputSchema: {
      type: 'object',
      properties: {
        cursor: { type: 'string', description: 'Opaque pagination cursor from a previous page; omit for the first page.' },
        pageSize: { type: 'number', description: 'Items per page, clamped 1-200 (default 50).' },
        statusIds: { type: 'array', items: { type: 'number' } },
        clientIds: { type: 'array', items: { type: 'number' } },
        query: { type: 'string' },
        updatedSince: { type: 'string', description: 'ISO-8601 timestamp.' },
        updatedBefore: { type: 'string', description: 'ISO-8601 timestamp.' },
        createdSince: { type: 'string', description: 'ISO-8601 timestamp.' },
        createdBefore: { type: 'string', description: 'ISO-8601 timestamp.' },
      },
    },
  },
  {
    name: 'gorelo_get_asset',
    description: 'Get a single agent (managed device) asset by id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'gorelo_list_custom_assets',
    description: 'List custom (non-agent) assets for the service provider, cursor-paginated, newest-created first.',
    inputSchema: {
      type: 'object',
      properties: {
        cursor: { type: 'string', description: 'Opaque pagination cursor from a previous page; omit for the first page.' },
        pageSize: { type: 'number', description: 'Items per page, clamped 1-200 (default 50).' },
        clientIds: { type: 'array', items: { type: 'number' } },
        query: { type: 'string' },
        updatedSince: { type: 'string', description: 'ISO-8601 timestamp.' },
        updatedBefore: { type: 'string', description: 'ISO-8601 timestamp.' },
        createdSince: { type: 'string', description: 'ISO-8601 timestamp.' },
        createdBefore: { type: 'string', description: 'ISO-8601 timestamp.' },
      },
    },
  },
];

export async function handleAssetTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'gorelo_list_assets') {
      const result = await listAssets(creds!, {
        cursor: args.cursor as string | undefined,
        pageSize: args.pageSize as number | undefined,
        statusIds: args.statusIds as number[] | undefined,
        clientIds: args.clientIds as number[] | undefined,
        query: args.query as string | undefined,
        updatedSince: args.updatedSince as string | undefined,
        updatedBefore: args.updatedBefore as string | undefined,
        createdSince: args.createdSince as string | undefined,
        createdBefore: args.createdBefore as string | undefined,
      });
      return textResult(result);
    }

    if (name === 'gorelo_get_asset') {
      const id = args.id as string;
      if (!id) return errorResult('id is required.');
      return textResult(await getAsset(creds!, id));
    }

    if (name === 'gorelo_list_custom_assets') {
      const result = await listCustomAssets(creds!, {
        cursor: args.cursor as string | undefined,
        pageSize: args.pageSize as number | undefined,
        clientIds: args.clientIds as number[] | undefined,
        query: args.query as string | undefined,
        updatedSince: args.updatedSince as string | undefined,
        updatedBefore: args.updatedBefore as string | undefined,
        createdSince: args.createdSince as string | undefined,
        createdBefore: args.createdBefore as string | undefined,
      });
      return textResult(result);
    }

    return errorResult(`Unknown asset tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
