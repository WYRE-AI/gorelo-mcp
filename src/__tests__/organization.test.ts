import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchToolCall as handleOrganizationTool } from '../tools/index.js';
import { textOf } from './test-helpers.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('handleOrganizationTool', () => {
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
    const result = await handleOrganizationTool('gorelo_list_users', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/No Gorelo credentials/);
  });

  it('gorelo_list_users paginates via cursor/pageSize', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: [{ Id: 1, Email: 'tech@example.com' }] }));
    const result = await handleOrganizationTool('gorelo_list_users', { cursor: 'abc', pageSize: 25 });
    expect(JSON.parse(textOf(result)).Data[0].Email).toBe('tech@example.com');
    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe('/v1/organization/users');
    expect(parsed.searchParams.get('Cursor')).toBe('abc');
    expect(parsed.searchParams.get('PageSize')).toBe('25');
  });

  it('gorelo_list_groups fetches the groups list', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: [{ Id: 1, Name: 'Tier 1' }] }));
    const result = await handleOrganizationTool('gorelo_list_groups', {});
    expect(JSON.parse(textOf(result)).Data[0].Name).toBe('Tier 1');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.usw.gorelo.io/v1/organization/groups');
  });

  it('returns an error for an unknown organization tool name', async () => {
    const result = await handleOrganizationTool('gorelo_not_a_real_tool', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/Unknown tool/);
  });
});
