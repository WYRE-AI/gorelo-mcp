import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchToolCall as handleContactTool } from '../tools/index.js';
import { textOf } from './test-helpers.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('handleContactTool', () => {
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
    const result = await handleContactTool('gorelo_list_contacts', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/No Gorelo credentials/);
  });

  it('gorelo_list_contacts filters by clientId', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: [{ Id: 1, FirstName: 'Ada' }] }));
    const result = await handleContactTool('gorelo_list_contacts', { clientId: 7 });
    expect(JSON.parse(textOf(result)).Data[0].FirstName).toBe('Ada');
    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe('/v1/contacts');
    expect(parsed.searchParams.get('ClientId')).toBe('7');
  });

  it('gorelo_get_contact requires id', async () => {
    const result = await handleContactTool('gorelo_get_contact', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/id is required/);
  });

  it('gorelo_get_contact fetches a single contact by id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: { Id: 1, FirstName: 'Ada' } }));
    const result = await handleContactTool('gorelo_get_contact', { id: 1 });
    expect(JSON.parse(textOf(result)).Data.FirstName).toBe('Ada');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.usw.gorelo.io/v1/contacts/1');
  });

  it('returns an error for an unknown contact tool name', async () => {
    const result = await handleContactTool('gorelo_not_a_real_tool', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/Unknown tool/);
  });
});
