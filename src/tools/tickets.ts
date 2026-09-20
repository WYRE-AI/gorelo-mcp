import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  getCredentials,
  getTicket,
  getTicketApproval,
  getTicketComment,
  listTicketComments,
  listTicketConversations,
  listTickets,
  listTicketStatuses,
  listTicketTags,
  listTicketTypes,
} from '../client.js';
import type { CallToolResult } from './types.js';
import { errorResult, requireCredentials, textResult } from './shared.js';

const ID_ARRAY = { type: 'array', items: { type: 'number' } } as const;

export const TICKET_TOOLS: Tool[] = [
  {
    name: 'gorelo_list_tickets',
    description:
      'List tickets for the service provider, cursor-paginated. Default sort is updatedOn desc. Filter by status, client, priority, type, assignee, contact, tag, group, a keyword query, or a created/updated date range.',
    inputSchema: {
      type: 'object',
      properties: {
        cursor: { type: 'string', description: 'Opaque pagination cursor from a previous page; omit for the first page.' },
        pageSize: { type: 'number', description: 'Items per page, clamped 1-200 (default 50).' },
        sortBy: { type: 'string', enum: ['updatedOn', 'createdOn'] },
        sortOrder: { type: 'string', enum: ['asc', 'desc'] },
        statusIds: ID_ARRAY,
        clientIds: ID_ARRAY,
        priorityIds: { ...ID_ARRAY, description: 'None=0, Urgent=1, High=2, Normal=3, Low=4.' },
        typeIds: ID_ARRAY,
        leadAssigneeIds: ID_ARRAY,
        contactIds: ID_ARRAY,
        tagIds: { ...ID_ARRAY, description: 'A ticket matches if it carries any of these tags.' },
        groupIds: { ...ID_ARRAY, description: 'A ticket matches if it is subscribed to any of these groups.' },
        query: { type: 'string', description: 'Keyword matched against the ticket title, number and display number.' },
        updatedSince: { type: 'string', description: 'ISO-8601 timestamp.' },
        updatedBefore: { type: 'string', description: 'ISO-8601 timestamp.' },
        createdSince: { type: 'string', description: 'ISO-8601 timestamp.' },
        createdBefore: { type: 'string', description: 'ISO-8601 timestamp.' },
      },
    },
  },
  {
    name: 'gorelo_get_ticket',
    description: 'Get a single ticket by id, with full detail.',
    inputSchema: {
      type: 'object',
      properties: { ticketId: { type: 'string', description: 'Ticket id (UUID).' } },
      required: ['ticketId'],
    },
  },
  {
    name: 'gorelo_list_ticket_statuses',
    description: 'List the ticket statuses configured for the service provider.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'gorelo_list_ticket_tags',
    description: 'List the ticket tags configured for the service provider.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'gorelo_list_ticket_types',
    description: 'List the ticket types configured for the service provider.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'gorelo_list_ticket_comments',
    description:
      'List the comments on a ticket, cursor-paginated, oldest-first by default. Filter from broadest to narrowest: nothing for every comment, conversationType alone to select a kind, or conversationType with conversationId for one specific conversation.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: { type: 'string' },
        conversationType: { type: 'string' },
        conversationId: { type: 'string' },
        cursor: { type: 'string' },
        pageSize: { type: 'number' },
        sortBy: { type: 'string' },
        sortOrder: { type: 'string', enum: ['asc', 'desc'] },
      },
      required: ['ticketId'],
    },
  },
  {
    name: 'gorelo_get_ticket_comment',
    description: "Get a single comment on a ticket. Includes the full BodyHtml (no BodyTruncated flag).",
    inputSchema: {
      type: 'object',
      properties: { ticketId: { type: 'string' }, commentId: { type: 'string' } },
      required: ['ticketId', 'commentId'],
    },
  },
  {
    name: 'gorelo_list_ticket_conversations',
    description:
      "List the conversations on a ticket. Public/Private (the main thread) come back with a null Id; Side Conversation and Approval carry a real Id usable as conversationId on the comments endpoint.",
    inputSchema: {
      type: 'object',
      properties: { ticketId: { type: 'string' } },
      required: ['ticketId'],
    },
  },
  {
    name: 'gorelo_get_ticket_approval',
    description:
      'Get a single approval on a ticket, including its approvers and computed status (Disapproved/Approved/Pending).',
    inputSchema: {
      type: 'object',
      properties: { ticketId: { type: 'string' }, approvalId: { type: 'string' } },
      required: ['ticketId', 'approvalId'],
    },
  },
];

export async function handleTicketTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'gorelo_list_tickets') {
      const result = await listTickets(creds!, {
        cursor: args.cursor as string | undefined,
        pageSize: args.pageSize as number | undefined,
        sortBy: args.sortBy as 'updatedOn' | 'createdOn' | undefined,
        sortOrder: args.sortOrder as 'asc' | 'desc' | undefined,
        statusIds: args.statusIds as number[] | undefined,
        clientIds: args.clientIds as number[] | undefined,
        priorityIds: args.priorityIds as number[] | undefined,
        typeIds: args.typeIds as number[] | undefined,
        leadAssigneeIds: args.leadAssigneeIds as number[] | undefined,
        contactIds: args.contactIds as number[] | undefined,
        tagIds: args.tagIds as number[] | undefined,
        groupIds: args.groupIds as number[] | undefined,
        query: args.query as string | undefined,
        updatedSince: args.updatedSince as string | undefined,
        updatedBefore: args.updatedBefore as string | undefined,
        createdSince: args.createdSince as string | undefined,
        createdBefore: args.createdBefore as string | undefined,
      });
      return textResult(result);
    }

    if (name === 'gorelo_get_ticket') {
      const ticketId = args.ticketId as string;
      if (!ticketId) return errorResult('ticketId is required.');
      return textResult(await getTicket(creds!, ticketId));
    }

    if (name === 'gorelo_list_ticket_statuses') {
      return textResult(await listTicketStatuses(creds!));
    }

    if (name === 'gorelo_list_ticket_tags') {
      return textResult(await listTicketTags(creds!));
    }

    if (name === 'gorelo_list_ticket_types') {
      return textResult(await listTicketTypes(creds!));
    }

    if (name === 'gorelo_list_ticket_comments') {
      const ticketId = args.ticketId as string;
      if (!ticketId) return errorResult('ticketId is required.');
      const result = await listTicketComments(creds!, ticketId, {
        conversationType: args.conversationType as string | undefined,
        conversationId: args.conversationId as string | undefined,
        cursor: args.cursor as string | undefined,
        pageSize: args.pageSize as number | undefined,
        sortBy: args.sortBy as string | undefined,
        sortOrder: args.sortOrder as 'asc' | 'desc' | undefined,
      });
      return textResult(result);
    }

    if (name === 'gorelo_get_ticket_comment') {
      const ticketId = args.ticketId as string;
      const commentId = args.commentId as string;
      if (!ticketId || !commentId) return errorResult('ticketId and commentId are required.');
      return textResult(await getTicketComment(creds!, ticketId, commentId));
    }

    if (name === 'gorelo_list_ticket_conversations') {
      const ticketId = args.ticketId as string;
      if (!ticketId) return errorResult('ticketId is required.');
      return textResult(await listTicketConversations(creds!, ticketId));
    }

    if (name === 'gorelo_get_ticket_approval') {
      const ticketId = args.ticketId as string;
      const approvalId = args.approvalId as string;
      if (!ticketId || !approvalId) return errorResult('ticketId and approvalId are required.');
      return textResult(await getTicketApproval(creds!, ticketId, approvalId));
    }

    return errorResult(`Unknown ticket tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
