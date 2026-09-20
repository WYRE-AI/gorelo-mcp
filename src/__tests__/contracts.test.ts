import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleContractTool } from '../tools/contracts.js';
import { textOf } from './test-helpers.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('handleContractTool', () => {
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
    const result = await handleContractTool('gorelo_list_contracts', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/No Gorelo credentials/);
  });

  it('gorelo_list_contracts filters by clientIds', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: [{ Id: 4021, Name: 'All Labor Terms' }] }));
    const result = await handleContractTool('gorelo_list_contracts', { clientIds: [88, 89] });
    expect(JSON.parse(textOf(result)).Data[0].Name).toBe('All Labor Terms');
    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe('/v1/contracts');
    expect(parsed.searchParams.get('ClientIds')).toBe('88,89');
  });

  it('returns an error for an unknown contract tool name', async () => {
    const result = await handleContractTool('gorelo_not_a_real_tool', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/Unknown contract tool/);
  });
});
