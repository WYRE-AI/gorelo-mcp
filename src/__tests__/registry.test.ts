import { describe, expect, it } from 'vitest';
import { GENERATED_TOOLS } from '../generated/tools.js';
import { dispatchToolCall, listTools } from '../tools/index.js';
import { selectTools, ToolConfigError } from '../tools/registry.js';

const names = (env: NodeJS.ProcessEnv) => selectTools(env).map((t) => t.name);
const BILLING = ['gorelo_create_invoice', 'gorelo_create_payment', 'gorelo_create_item', 'gorelo_update_item'];
const nBilling = GENERATED_TOOLS.filter((t) => t.billingWrite).length;
const count = (tier: string) => GENERATED_TOOLS.filter((t) => t.tier === tier && !t.billingWrite).length;

describe('tool selection', () => {
  it('defaults to read + write, with destructive tools off', () => {
    const tools = selectTools({});
    expect(tools.some((t) => t.tier === 'destructive')).toBe(false);
    expect(tools).toHaveLength(count('read') + count('write'));
  });

  it('enables destructive tools only with GORELO_ENABLE_DESTRUCTIVE=true', () => {
    expect(selectTools({ GORELO_ENABLE_DESTRUCTIVE: 'true' })).toHaveLength(GENERATED_TOOLS.length - nBilling);
    expect(selectTools({ GORELO_ENABLE_DESTRUCTIVE: 'false' })).toHaveLength(count('read') + count('write'));
    expect(selectTools({ GORELO_ENABLE_DESTRUCTIVE: 'yes' }).some((t) => t.tier === 'destructive')).toBe(false);
  });

  it('readonly preset is read tools only, even with the destructive flag', () => {
    const tools = selectTools({ GORELO_PRESET: 'readonly', GORELO_ENABLE_DESTRUCTIVE: 'true' });
    expect(tools).toHaveLength(count('read'));
    expect(tools.every((t) => t.tier === 'read')).toBe(true);
  });

  it('tag presets narrow and never widen the destructive gate', () => {
    const crm = selectTools({ GORELO_PRESET: 'crm' });
    expect(crm.length).toBeGreaterThan(0);
    expect(crm.every((t) => t.tags.some((tag) => ['Clients', 'Contacts', 'Organization'].includes(tag)))).toBe(true);
    expect(crm.some((t) => t.name === 'gorelo_delete_client')).toBe(false);
    expect(names({ GORELO_PRESET: 'crm', GORELO_ENABLE_DESTRUCTIVE: 'true' })).toContain('gorelo_delete_client');

    expect(names({ GORELO_PRESET: 'monitoring' })).toEqual(expect.arrayContaining(['gorelo_list_alerts', 'gorelo_list_assets']));
    expect(names({ GORELO_PRESET: 'monitoring' })).not.toContain('gorelo_list_tickets');
    expect(names({ GORELO_PRESET: 'tickets' })).toEqual(expect.arrayContaining(['gorelo_create_ticket_comment', 'gorelo_list_contacts']));
    expect(names({ GORELO_PRESET: 'tickets' })).not.toContain('gorelo_list_alerts');
  });

  it('rejects an unknown preset', () => {
    expect(() => selectTools({ GORELO_PRESET: 'everything' })).toThrow(ToolConfigError);
  });

  it('applies include/exclude globs; include cannot enable destructive tools', () => {
    expect(names({ GORELO_TOOLS_INCLUDE: 'gorelo_*_ticket*' })).toEqual(expect.arrayContaining(['gorelo_list_tickets']));
    expect(names({ GORELO_TOOLS_INCLUDE: 'gorelo_*_ticket*' }).every((n) => n.includes('ticket'))).toBe(true);
    expect(names({ GORELO_TOOLS_EXCLUDE: 'gorelo_create_*,gorelo_update_*' }).some((n) => /^gorelo_(create|update)_/.test(n))).toBe(false);
    expect(names({ GORELO_TOOLS_INCLUDE: 'gorelo_delete_*,gorelo_list_clients' })).toEqual(['gorelo_list_clients']);
    expect(() => selectTools({ GORELO_TOOLS_INCLUDE: 'nope_*' })).toThrow(ToolConfigError);
  });
});

describe('billing writes', () => {
  it('are hidden by default and shown only with GORELO_ENABLE_BILLING_WRITES=true', () => {
    for (const n of BILLING) expect(names({})).not.toContain(n);
    for (const n of BILLING) expect(names({ GORELO_ENABLE_BILLING_WRITES: 'true' })).toContain(n);
    for (const n of BILLING) expect(names({ GORELO_ENABLE_BILLING_WRITES: 'yes' })).not.toContain(n);
    expect(selectTools({ GORELO_ENABLE_BILLING_WRITES: 'true' })).toHaveLength(count('read') + count('write') + nBilling);
  });

  it('leave time entries, billing reads and readonly alone', () => {
    expect(names({})).toEqual(expect.arrayContaining(['gorelo_create_time_entry', 'gorelo_update_time_entry', 'gorelo_list_invoices']));
    expect(names({ GORELO_PRESET: 'readonly', GORELO_ENABLE_BILLING_WRITES: 'true' }).some((n) => BILLING.includes(n))).toBe(false);
  });

  it('are independent of the destructive flag', () => {
    for (const n of BILLING) expect(names({ GORELO_ENABLE_DESTRUCTIVE: 'true' })).not.toContain(n);
    expect(names({ GORELO_ENABLE_BILLING_WRITES: 'true' })).not.toContain('gorelo_delete_invoice');
  });

  it('are refused at call time unless enabled, without calling Gorelo', async () => {
    const result = await dispatchToolCall('gorelo_create_invoice', { body: {} }, {});
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toMatch(/is turned off\. Changing invoices, payments and catalog items is off by default for this connection\./);
    const readonly = await dispatchToolCall('gorelo_create_payment', { body: {} }, { GORELO_PRESET: 'readonly', GORELO_ENABLE_BILLING_WRITES: 'true' });
    expect(readonly.isError).toBe(true);
  });
});

describe('sensitive exclusions', () => {
  it('api key create/delete are unknown tools even with every flag on', async () => {
    const env = { GORELO_ENABLE_DESTRUCTIVE: 'true', GORELO_ENABLE_BILLING_WRITES: 'true' };
    expect(names(env)).not.toContain('gorelo_create_api_key');
    expect(names(env)).not.toContain('gorelo_delete_api_key');
    for (const n of ['gorelo_create_api_key', 'gorelo_delete_api_key']) {
      const r = await dispatchToolCall(n, {}, env);
      expect(r.isError).toBe(true);
      expect(JSON.stringify(r)).toMatch(/Unknown tool/);
    }
  });
});

describe('tools/list', () => {
  it('annotates each tier', () => {
    const byName = new Map(listTools({ GORELO_ENABLE_DESTRUCTIVE: 'true' }).map((t) => [t.name, t]));
    expect(byName.get('gorelo_list_tickets')?.annotations).toEqual({ readOnlyHint: true });
    expect(byName.get('gorelo_create_ticket')?.annotations).toEqual({ readOnlyHint: false, destructiveHint: false });
    expect(byName.get('gorelo_delete_ticket')?.annotations).toEqual({ readOnlyHint: false, destructiveHint: true });
  });

  it('stays compact', () => {
    expect(JSON.stringify(listTools({ GORELO_PRESET: 'readonly' })).length).toBeLessThan(60_000);
    expect(JSON.stringify(listTools({ GORELO_ENABLE_DESTRUCTIVE: 'true' })).length).toBeLessThan(150_000);
  });
});

describe('dispatch gating', () => {
  it('refuses a destructive tool by name when the flag is off, without calling Gorelo', async () => {
    const result = await dispatchToolCall('gorelo_delete_ticket', { ticketId: 't1' }, {});
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toMatch(/is turned off\. Deleting Gorelo records is off by default for this connection\./);
  });

  it('refuses write tools under the readonly preset', async () => {
    const result = await dispatchToolCall('gorelo_create_ticket', { body: {} }, { GORELO_PRESET: 'readonly' });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toMatch(/isn't turned on for this connection\./);
  });
});
