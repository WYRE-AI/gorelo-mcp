import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchToolCall as handleAssetTool } from '../tools/index.js';
import { textOf } from './test-helpers.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('handleAssetTool', () => {
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
    const result = await handleAssetTool('gorelo_list_assets', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/No Gorelo credentials/);
  });

  it('gorelo_list_assets fetches agent assets with filters', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: [{ Id: 'd1', Name: 'LAPTOP-01' }] }));
    const result = await handleAssetTool('gorelo_list_assets', { clientIds: [1] });
    expect(JSON.parse(textOf(result)).Data[0].Name).toBe('LAPTOP-01');
    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe('/v1/assets/agents');
    expect(parsed.searchParams.get('ClientIds')).toBe('1');
  });

  it('gorelo_get_asset requires id', async () => {
    const result = await handleAssetTool('gorelo_get_asset', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/id is required/);
  });

  it('gorelo_get_asset fetches a single agent asset by id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: { Id: 'd1', Name: 'LAPTOP-01' } }));
    const result = await handleAssetTool('gorelo_get_asset', { id: 'd1' });
    expect(JSON.parse(textOf(result)).Data.Name).toBe('LAPTOP-01');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.usw.gorelo.io/v1/assets/agents/d1');
  });

  it('gorelo_list_custom_assets fetches custom assets with filters', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: [{ Id: 9, Name: 'Printer' }] }));
    const result = await handleAssetTool('gorelo_list_custom_assets', { query: 'printer' });
    expect(JSON.parse(textOf(result)).Data[0].Name).toBe('Printer');
    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe('/v1/assets/custom');
    expect(parsed.searchParams.get('Query')).toBe('printer');
  });

  it('returns an error for an unknown asset tool name', async () => {
    const result = await handleAssetTool('gorelo_not_a_real_tool', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/Unknown tool/);
  });
});
