import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchToolCall as handleTicketTool } from '../tools/index.js';
import { textOf } from './test-helpers.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('handleTicketTool', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    process.env.GORELO_API_KEY = 'key-1';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GORELO_API_KEY;
  });

  it('errors when credentials are missing', async () => {
    delete process.env.GORELO_API_KEY;
    const result = await handleTicketTool('gorelo_list_tickets', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/No Gorelo credentials/);
  });

  it('gorelo_list_tickets builds the query string from filters and returns the envelope', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: [{ Id: 't1', Title: 'Ticket 1' }] }));

    const result = await handleTicketTool('gorelo_list_tickets', {
      statusIds: [1, 2],
      sortBy: 'createdOn',
      sortOrder: 'asc',
      query: 'printer',
    });

    expect(JSON.parse(textOf(result)).Data[0].Title).toBe('Ticket 1');
    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe('/v1/tickets');
    expect(parsed.searchParams.get('StatusIds')).toBe('1,2');
    expect(parsed.searchParams.get('SortBy')).toBe('createdOn');
    expect(parsed.searchParams.get('Query')).toBe('printer');
  });

  it('gorelo_get_ticket requires ticketId', async () => {
    const result = await handleTicketTool('gorelo_get_ticket', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/ticketId is required/);
  });

  it('gorelo_get_ticket fetches a single ticket by id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: { Id: 't1', Title: 'Ticket 1' } }));
    const result = await handleTicketTool('gorelo_get_ticket', { ticketId: 't1' });
    expect(JSON.parse(textOf(result)).Data.Title).toBe('Ticket 1');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.usw.gorelo.io/v1/tickets/t1');
  });

  it('gorelo_list_ticket_statuses fetches the statuses list', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: [{ Id: 1, Name: 'Open' }] }));
    const result = await handleTicketTool('gorelo_list_ticket_statuses', {});
    expect(JSON.parse(textOf(result)).Data[0].Name).toBe('Open');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.usw.gorelo.io/v1/tickets/statuses');
  });

  it('gorelo_list_ticket_tags fetches the tags list', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: [{ Id: 1, Name: 'urgent' }] }));
    const result = await handleTicketTool('gorelo_list_ticket_tags', {});
    expect(JSON.parse(textOf(result)).Data[0].Name).toBe('urgent');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.usw.gorelo.io/v1/tickets/tags');
  });

  it('gorelo_list_ticket_types fetches the types list', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: [{ Id: 1, Name: 'Incident' }] }));
    const result = await handleTicketTool('gorelo_list_ticket_types', {});
    expect(JSON.parse(textOf(result)).Data[0].Name).toBe('Incident');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.usw.gorelo.io/v1/tickets/types');
  });

  it('gorelo_list_ticket_comments requires ticketId and passes conversation filters through', async () => {
    const missing = await handleTicketTool('gorelo_list_ticket_comments', {});
    expect(missing.isError).toBe(true);

    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: [] }));
    await handleTicketTool('gorelo_list_ticket_comments', {
      ticketId: 't1',
      conversationType: 'SideConversation',
      conversationId: 'c1',
    });
    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe('/v1/tickets/t1/comments');
    expect(parsed.searchParams.get('ConversationType')).toBe('SideConversation');
    expect(parsed.searchParams.get('ConversationId')).toBe('c1');
  });

  it('gorelo_get_ticket_comment requires ticketId and commentId', async () => {
    const result = await handleTicketTool('gorelo_get_ticket_comment', { ticketId: 't1' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/commentId is required/);
  });

  it('gorelo_get_ticket_comment fetches a single comment', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: { Id: 'c1', BodyText: 'hello' } }));
    const result = await handleTicketTool('gorelo_get_ticket_comment', { ticketId: 't1', commentId: 'c1' });
    expect(JSON.parse(textOf(result)).Data.BodyText).toBe('hello');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.usw.gorelo.io/v1/tickets/t1/comments/c1');
  });

  it('gorelo_list_ticket_conversations requires ticketId', async () => {
    const result = await handleTicketTool('gorelo_list_ticket_conversations', {});
    expect(result.isError).toBe(true);
  });

  it('gorelo_list_ticket_conversations fetches the conversations list', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: [{ Id: null, Type: { Name: 'Public' } }] }));
    const result = await handleTicketTool('gorelo_list_ticket_conversations', { ticketId: 't1' });
    expect(JSON.parse(textOf(result)).Data[0].Type.Name).toBe('Public');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.usw.gorelo.io/v1/tickets/t1/conversations');
  });

  it('gorelo_get_ticket_approval requires ticketId and approvalId', async () => {
    const result = await handleTicketTool('gorelo_get_ticket_approval', { ticketId: 't1' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/approvalId is required/);
  });

  it('gorelo_get_ticket_approval fetches a single approval', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: { Id: 'a1', Status: 'Approved' } }));
    const result = await handleTicketTool('gorelo_get_ticket_approval', { ticketId: 't1', approvalId: 'a1' });
    expect(JSON.parse(textOf(result)).Data.Status).toBe('Approved');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.usw.gorelo.io/v1/tickets/t1/approvals/a1');
  });

  it('propagates a client error into an errorResult rather than throwing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 403));
    const result = await handleTicketTool('gorelo_list_tickets', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/HTTP 403/);
  });

  it('returns an error for an unknown ticket tool name', async () => {
    const result = await handleTicketTool('gorelo_not_a_real_tool', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/Unknown tool/);
  });
});
