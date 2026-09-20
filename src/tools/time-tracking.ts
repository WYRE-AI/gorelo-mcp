import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, getTimeEntry, listBillingRoles, listTimeEntries, listWorkTypes } from '../client.js';
import type { CallToolResult } from './types.js';
import { errorResult, requireCredentials, textResult } from './shared.js';

export const TIME_TRACKING_TOOLS: Tool[] = [
  {
    name: 'gorelo_list_time_entries',
    description: 'List logged time across every ticket and task, cursor-paginated, narrowed by any of the filters.',
    inputSchema: {
      type: 'object',
      properties: {
        cursor: { type: 'string', description: 'Opaque pagination cursor from a previous page; omit for the first page.' },
        pageSize: { type: 'number', description: 'Items per page, clamped 1-200 (default 50).' },
        clientIds: { type: 'array', items: { type: 'number' } },
        locationIds: { type: 'array', items: { type: 'number' } },
        ticketIds: { type: 'array', items: { type: 'string' } },
        taskIds: { type: 'array', items: { type: 'string' } },
        userIds: { type: 'array', items: { type: 'number' } },
        invoiceIds: { type: 'array', items: { type: 'number' } },
        startedSince: { type: 'string', description: 'ISO-8601 timestamp.' },
        startedBefore: { type: 'string', description: 'ISO-8601 timestamp.' },
        createdSince: { type: 'string', description: 'ISO-8601 timestamp.' },
        createdBefore: { type: 'string', description: 'ISO-8601 timestamp.' },
        updatedSince: { type: 'string', description: 'ISO-8601 timestamp.' },
        updatedBefore: { type: 'string', description: 'ISO-8601 timestamp.' },
      },
    },
  },
  {
    name: 'gorelo_get_time_entry',
    description: 'Get a single time entry by id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number' } },
      required: ['id'],
    },
  },
  {
    name: 'gorelo_list_billing_roles',
    description:
      "List the billing roles configured for the service provider. Use a role's id as BillingRoleId when logging time against a ticket.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'gorelo_list_work_types',
    description:
      "List the work types configured for the service provider. Use a work type's id as WorkTypeId when logging time against a ticket.",
    inputSchema: { type: 'object', properties: {} },
  },
];

export async function handleTimeTrackingTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'gorelo_list_time_entries') {
      const result = await listTimeEntries(creds!, {
        cursor: args.cursor as string | undefined,
        pageSize: args.pageSize as number | undefined,
        clientIds: args.clientIds as number[] | undefined,
        locationIds: args.locationIds as number[] | undefined,
        ticketIds: args.ticketIds as string[] | undefined,
        taskIds: args.taskIds as string[] | undefined,
        userIds: args.userIds as number[] | undefined,
        invoiceIds: args.invoiceIds as number[] | undefined,
        startedSince: args.startedSince as string | undefined,
        startedBefore: args.startedBefore as string | undefined,
        createdSince: args.createdSince as string | undefined,
        createdBefore: args.createdBefore as string | undefined,
        updatedSince: args.updatedSince as string | undefined,
        updatedBefore: args.updatedBefore as string | undefined,
      });
      return textResult(result);
    }

    if (name === 'gorelo_get_time_entry') {
      const id = args.id as number;
      if (id === undefined || id === null) return errorResult('id is required.');
      return textResult(await getTimeEntry(creds!, id));
    }

    if (name === 'gorelo_list_billing_roles') {
      return textResult(await listBillingRoles(creds!));
    }

    if (name === 'gorelo_list_work_types') {
      return textResult(await listWorkTypes(creds!));
    }

    return errorResult(`Unknown time-tracking tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
