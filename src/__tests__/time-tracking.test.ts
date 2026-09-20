import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleTimeTrackingTool } from '../tools/time-tracking.js';
import { textOf } from './test-helpers.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('handleTimeTrackingTool', () => {
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
    const result = await handleTimeTrackingTool('gorelo_list_time_entries', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/No Gorelo credentials/);
  });

  it('gorelo_list_time_entries passes ticketIds and date filters through', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: [{ Id: 88214, ActualHours: 1.5 }] }));
    const result = await handleTimeTrackingTool('gorelo_list_time_entries', {
      ticketIds: ['t1', 't2'],
      startedSince: '2026-01-01T00:00:00Z',
    });
    expect(JSON.parse(textOf(result)).Data[0].ActualHours).toBe(1.5);
    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe('/v1/time-entries');
    expect(parsed.searchParams.get('TicketIds')).toBe('t1,t2');
    expect(parsed.searchParams.get('StartedSince')).toBe('2026-01-01T00:00:00Z');
  });

  it('gorelo_get_time_entry requires id', async () => {
    const result = await handleTimeTrackingTool('gorelo_get_time_entry', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/id is required/);
  });

  it('gorelo_get_time_entry fetches a single time entry by id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: { Id: 88214 } }));
    const result = await handleTimeTrackingTool('gorelo_get_time_entry', { id: 88214 });
    expect(JSON.parse(textOf(result)).Data.Id).toBe(88214);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.usw.gorelo.io/v1/time-entries/88214');
  });

  it('gorelo_list_billing_roles fetches the billing roles list', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: [{ Id: 1, Name: 'Senior Tech' }] }));
    const result = await handleTimeTrackingTool('gorelo_list_billing_roles', {});
    expect(JSON.parse(textOf(result)).Data[0].Name).toBe('Senior Tech');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.usw.gorelo.io/v1/billing-roles');
  });

  it('gorelo_list_work_types fetches the work types list', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ IsSuccess: true, Data: [{ Id: 1, Name: 'Remote Support' }] }));
    const result = await handleTimeTrackingTool('gorelo_list_work_types', {});
    expect(JSON.parse(textOf(result)).Data[0].Name).toBe('Remote Support');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.usw.gorelo.io/v1/work-types');
  });

  it('returns an error for an unknown time-tracking tool name', async () => {
    const result = await handleTimeTrackingTool('gorelo_not_a_real_tool', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/Unknown time-tracking tool/);
  });
});
