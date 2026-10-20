import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchToolCall } from '../tools/index.js';
import { MAX_RESPONSE_BYTES } from '../executor.js';
import { textOf } from './test-helpers.js';

const fetchMock = vi.fn();
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const call = (name: string, args: Record<string, unknown> = {}, env: NodeJS.ProcessEnv = {}) => dispatchToolCall(name, args, env);

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  process.env.GORELO_API_KEY = 'secret-key-123';
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GORELO_API_KEY;
  delete process.env.GORELO_REGION;
});

describe('requests', () => {
  it('sends a JSON body for writes and returns the response', async () => {
    fetchMock.mockResolvedValueOnce(json({ IsSuccess: true, Data: { Id: 'c1' } }, 201));
    const result = await call('gorelo_create_ticket_comment', { ticketId: 't1', body: { Body: 'hi' } });
    expect(result.isError).toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.usw.gorelo.io/v1/tickets/t1/comments');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ Body: 'hi' });
  });

  it('accepts a JSON string for body and rejects non-objects', async () => {
    fetchMock.mockResolvedValueOnce(json({ IsSuccess: true }));
    await call('gorelo_update_ticket', { ticketId: 't1', body: '{"Title":"x"}' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ Title: 'x' });
    const bad = await call('gorelo_update_ticket', { ticketId: 't1', body: 'not json' });
    expect(bad.isError).toBe(true);
  });

  it('URL-encodes path params and rejects dot segments', async () => {
    fetchMock.mockResolvedValueOnce(json({}));
    await call('gorelo_get_ticket', { ticketId: 'a/b?c#d' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.usw.gorelo.io/v1/tickets/a%2Fb%3Fc%23d');
    for (const id of ['..', '.']) {
      const result = await call('gorelo_get_ticket', { ticketId: id });
      expect(result.isError).toBe(true);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('always targets the region host, never one supplied by the caller', async () => {
    fetchMock.mockResolvedValue(json({}));
    process.env.GORELO_REGION = 'au';
    await call('gorelo_get_ticket', { ticketId: 'https://evil.example/x' });
    await call('gorelo_list_tickets', { query: 'http://evil.example' });
    for (const [url] of fetchMock.mock.calls) expect(new URL(url as string).host).toBe('api.aue.gorelo.io');
    const extra = await call('gorelo_list_tickets', { baseUrl: 'https://evil.example' });
    expect(extra.isError).toBe(true);
    expect(textOf(extra)).toMatch(/Unknown argument/);
  });

  it('maps legacy argument names (id) to the spec path parameter', async () => {
    fetchMock.mockResolvedValueOnce(json({}));
    await call('gorelo_get_client', { id: 7 });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.usw.gorelo.io/v1/clients/7');
  });

  it('reports a success with no body (e.g. DELETE 204)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = await call('gorelo_delete_ticket', { ticketId: 't1' }, { GORELO_ENABLE_DESTRUCTIVE: 'true' });
    expect(JSON.parse(textOf(result))).toEqual({ ok: true, status: 204 });
  });
});

describe('errors', () => {
  it('a body-read failure after a 2xx is an error, not an empty success', async () => {
    const broken = new Response(
      new ReadableStream({ start(c) { c.error(new Error('socket reset')); } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
    fetchMock.mockResolvedValueOnce(broken);
    const result = await call('gorelo_list_tickets');
    expect(result.isError).toBe(true);
    expect(textOf(result)).not.toMatch(/"ok":true/);
    expect(textOf(result)).toMatch(/HTTP 200 but the response body could not be read: socket reset/);
  });

  it('403 names the tool and points at API key scopes', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 403));
    const result = await call('gorelo_list_tickets');
    expect(textOf(result)).toBe(
      "Error: The Gorelo API key for this connection doesn't have permission to run gorelo_list_tickets (HTTP 403). An admin can check the key's permissions in Gorelo under Settings → Integrations."
    );
  });

  it('has clear 401, 404 and 422 messages and never echoes the API key', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 401));
    expect(textOf(await call('gorelo_list_tickets'))).toMatch(/rejected the API key \(HTTP 401\)/);
    fetchMock.mockResolvedValueOnce(json({}, 404));
    expect(textOf(await call('gorelo_get_ticket', { ticketId: 'x' }))).toMatch(/Not found \(HTTP 404\) for gorelo_get_ticket/);
    fetchMock.mockResolvedValueOnce(json({ Notifications: [{ Message: 'Title is required' }] }, 422));
    const result = textOf(await call('gorelo_create_ticket', { body: {} }));
    expect(result).toMatch(/HTTP 422/);
    expect(result).toMatch(/Title is required/);
    expect(result).not.toContain('secret-key-123');
  });

  it('requires credentials', async () => {
    delete process.env.GORELO_API_KEY;
    expect(textOf(await call('gorelo_list_tickets'))).toMatch(/No Gorelo credentials/);
  });

  it('reports every missing required argument', async () => {
    expect(textOf(await call('gorelo_get_ticket_comment', {}))).toMatch(/ticketId and commentId are required/);
  });
});

describe('429 handling', () => {
  it('retries with Retry-After and then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(json({}, 429, { 'Retry-After': '0' }))
      .mockResolvedValueOnce(json({}, 429, { 'Retry-After': '0' }))
      .mockResolvedValueOnce(json({ Data: [] }));
    const result = await call('gorelo_list_tickets');
    expect(result.isError).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gives up after a bounded number of retries', async () => {
    fetchMock.mockImplementation(async () => json({}, 429, { 'Retry-After': '0' }));
    const result = await call('gorelo_list_tickets');
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/rate limit/i);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe('response size guard', () => {
  it('truncates responses over 100KB with a marker', async () => {
    fetchMock.mockResolvedValueOnce(json({ Data: 'x'.repeat(MAX_RESPONSE_BYTES * 2) }));
    const text = textOf(await call('gorelo_list_tickets'));
    expect(text).toMatch(/\[TRUNCATED: response was \d+ bytes, limit 102400/);
    expect(Buffer.byteLength(text)).toBeLessThan(MAX_RESPONSE_BYTES + 400);
  });

  it('passes small responses through untouched', async () => {
    fetchMock.mockResolvedValueOnce(json({ Data: [1] }));
    expect(JSON.parse(textOf(await call('gorelo_list_tickets')))).toEqual({ Data: [1] });
  });
});
