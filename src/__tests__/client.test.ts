import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  baseUrlForRegion,
  GoreloApiError,
  GoreloAuthError,
  GoreloForbiddenError,
  GoreloRateLimitError,
  getClient,
  listTickets,
} from '../client.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('baseUrlForRegion', () => {
  it('maps each documented region to its hostname and defaults to us', () => {
    expect(baseUrlForRegion('us')).toBe('https://api.usw.gorelo.io');
    expect(baseUrlForRegion('au')).toBe('https://api.aue.gorelo.io');
    expect(baseUrlForRegion(undefined)).toBe('https://api.usw.gorelo.io');
    expect(baseUrlForRegion('not-a-region')).toBe('https://api.usw.gorelo.io');
  });
});

describe('GET requests', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the API key as X-API-Key and uses the region-specific host', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: { Id: 1, Name: 'Acme' } }));

    const result = await getClient({ apiKey: 'key-1', region: 'au' }, 1);

    expect(result.Data?.Name).toBe('Acme');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.aue.gorelo.io/v1/clients/1');
    expect(init.headers['X-API-Key']).toBe('key-1');
  });

  it('joins array filter values with commas and drops undefined entries', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: [] }));

    await listTickets({ apiKey: 'key-1' }, { statusIds: [1, 2, 3], clientIds: undefined });

    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get('StatusIds')).toBe('1,2,3');
    expect(parsed.searchParams.has('ClientIds')).toBe(false);
  });

  it('throws GoreloAuthError on HTTP 401', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));
    await expect(getClient({ apiKey: 'bad-key' }, 1)).rejects.toThrow(GoreloAuthError);
  });

  it('throws GoreloForbiddenError on HTTP 403', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 403));
    await expect(getClient({ apiKey: 'key-1' }, 1)).rejects.toThrow(GoreloForbiddenError);
  });

  it('throws GoreloRateLimitError on HTTP 429', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 429));
    await expect(getClient({ apiKey: 'key-1' }, 1)).rejects.toThrow(GoreloRateLimitError);
  });

  it('throws GoreloApiError with the status code on any other non-2xx response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ Message: 'boom' }, 500));
    await expect(getClient({ apiKey: 'key-1' }, 1)).rejects.toThrow(GoreloApiError);
    fetchMock.mockResolvedValueOnce(jsonResponse({ Message: 'boom' }, 500));
    try {
      await getClient({ apiKey: 'key-1' }, 1);
      throw new Error('expected rejection');
    } catch (err) {
      expect((err as GoreloApiError).status).toBe(500);
    }
  });
});
