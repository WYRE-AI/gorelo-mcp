import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleClientTool } from '../tools/clients.js';
import { textOf } from './test-helpers.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('handleClientTool', () => {
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
    const result = await handleClientTool('gorelo_list_clients', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/No Gorelo credentials/);
  });

  it('gorelo_list_clients returns the client envelope and passes filters through', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: [{ Id: 1, Name: 'Acme' }] }));
    const result = await handleClientTool('gorelo_list_clients', { query: 'acme', pageSize: 10 });
    expect(JSON.parse(textOf(result)).Data[0].Name).toBe('Acme');
    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe('/v1/clients');
    expect(parsed.searchParams.get('Query')).toBe('acme');
    expect(parsed.searchParams.get('PageSize')).toBe('10');
  });

  it('gorelo_get_client requires id', async () => {
    const result = await handleClientTool('gorelo_get_client', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/id is required/);
  });

  it('gorelo_get_client fetches a single client by id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: { Id: 1, Name: 'Acme' } }));
    const result = await handleClientTool('gorelo_get_client', { id: 1 });
    expect(JSON.parse(textOf(result)).Data.Name).toBe('Acme');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.usw.gorelo.io/v1/clients/1');
  });

  it('gorelo_list_client_locations requires clientId', async () => {
    const result = await handleClientTool('gorelo_list_client_locations', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/clientId is required/);
  });

  it('gorelo_list_client_locations fetches locations for a client', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: [{ Id: 5, Name: 'HQ' }] }));
    const result = await handleClientTool('gorelo_list_client_locations', { clientId: 1 });
    expect(JSON.parse(textOf(result)).Data[0].Name).toBe('HQ');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.usw.gorelo.io/v1/clients/1/locations');
  });

  it('returns an error for an unknown client tool name', async () => {
    const result = await handleClientTool('gorelo_not_a_real_tool', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/Unknown client tool/);
  });
});
