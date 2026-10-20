import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GENERATED_TOOLS } from '../generated/tools.js';

const ROOT = resolve(__dirname, '../..');
const spec = JSON.parse(readFileSync(join(ROOT, 'spec/gorelo-openapi.json'), 'utf8'));
const operations = Object.values(spec.paths as Record<string, Record<string, unknown>>).flatMap((item) =>
  Object.keys(item).filter((m) => ['get', 'post', 'put', 'patch', 'delete'].includes(m))
);

const LEGACY_NAMES = [
  'gorelo_list_tickets', 'gorelo_get_ticket', 'gorelo_list_ticket_statuses', 'gorelo_list_ticket_tags',
  'gorelo_list_ticket_types', 'gorelo_list_ticket_comments', 'gorelo_get_ticket_comment',
  'gorelo_list_ticket_conversations', 'gorelo_get_ticket_approval', 'gorelo_list_clients', 'gorelo_get_client',
  'gorelo_list_client_locations', 'gorelo_list_contacts', 'gorelo_get_contact', 'gorelo_list_contracts',
  'gorelo_list_assets', 'gorelo_get_asset', 'gorelo_list_custom_assets', 'gorelo_list_time_entries',
  'gorelo_get_time_entry', 'gorelo_list_billing_roles', 'gorelo_list_work_types', 'gorelo_list_users',
  'gorelo_list_groups',
];

describe('generated tools', () => {
  it('covers every spec operation except the 3 binary and 2 sensitive exclusions', () => {
    expect(operations).toHaveLength(117);
    expect(GENERATED_TOOLS).toHaveLength(112);
    const paths = new Set(GENERATED_TOOLS.map((t) => `${t.method} ${t.path}`));
    for (const excluded of ['POST /v1/attachments', 'GET /v1/invoices/{invoiceId}/pdf', 'GET /v1/documents/{documentId}/pdf', 'POST /v1/api-keys', 'DELETE /v1/api-keys/{apiKeyId}']) {
      expect(paths.has(excluded)).toBe(false);
    }
  });

  it('has unique, well-formed names', () => {
    const names = GENERATED_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^gorelo_[a-z0-9_]+$/);
  });

  it('keeps the original 24 tool names on the same operations', () => {
    const names = new Set(GENERATED_TOOLS.map((t) => t.name));
    for (const name of LEGACY_NAMES) expect(names.has(name), name).toBe(true);
    for (const t of GENERATED_TOOLS.filter((t) => LEGACY_NAMES.includes(t.name))) expect(t.method).toBe('GET');
  });

  it('derives tiers from the HTTP method', () => {
    for (const t of GENERATED_TOOLS) {
      const expected = t.method === 'GET' ? 'read' : t.method === 'DELETE' ? 'destructive' : 'write';
      expect(t.tier, t.name).toBe(expected);
    }
    expect(GENERATED_TOOLS.filter((t) => t.tier === 'read')).toHaveLength(58);
    expect(GENERATED_TOOLS.filter((t) => t.tier === 'write')).toHaveLength(36);
    expect(GENERATED_TOOLS.filter((t) => t.tier === 'destructive')).toHaveLength(18);
  });

  it('never generates api key creation/revocation; listing stays', () => {
    const names = GENERATED_TOOLS.map((t) => t.name);
    expect(names).not.toContain('gorelo_create_api_key');
    expect(names).not.toContain('gorelo_delete_api_key');
    expect(GENERATED_TOOLS.some((t) => t.path.startsWith('/v1/api-keys') && t.method !== 'GET')).toBe(false);
    expect(names).toContain('gorelo_list_api_keys');
  });

  it('flags billing writes except time entries', () => {
    const flagged = GENERATED_TOOLS.filter((t) => t.billingWrite).map((t) => t.name).sort();
    expect(flagged).toEqual(['gorelo_create_invoice', 'gorelo_create_item', 'gorelo_create_payment', 'gorelo_update_item']);
    expect(GENERATED_TOOLS.every((t) => !t.billingWrite || t.tier === 'write')).toBe(true);
    for (const n of ['gorelo_create_time_entry', 'gorelo_update_time_entry']) {
      const t = GENERATED_TOOLS.find((x) => x.name === n);
      expect(t, n).toBeDefined();
      expect(t?.billingWrite).toBeUndefined();
    }
  });

  it('keeps descriptions short and free of raw operation ids', () => {
    for (const t of GENERATED_TOOLS) {
      expect(t.description.length, t.name).toBeGreaterThan(0);
      expect(t.description.length, t.name).toBeLessThanOrEqual(201);
      expect(t.description, t.name).not.toMatch(/\b(get|post|patch|delete)_v1_/);
    }
  });

  it('declares every path placeholder as a required path argument, and only relative paths', () => {
    for (const t of GENERATED_TOOLS) {
      expect(t.path.startsWith('/v1/'), t.name).toBe(true);
      const placeholders = [...t.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
      const pathParams = t.params.filter((p) => p.in === 'path');
      expect(pathParams.map((p) => p.wire).sort(), t.name).toEqual([...placeholders].sort());
      for (const p of pathParams) expect(t.inputSchema.required, t.name).toContain(p.arg);
      expect(t.hasBody, t.name).toBe(Boolean(t.inputSchema.properties.body));
    }
  });

  it('marks client/contact/organization writes as admin and alert creation as not admin', () => {
    const admin = new Set(GENERATED_TOOLS.filter((t) => t.admin).map((t) => t.name));
    for (const name of ['gorelo_create_client', 'gorelo_update_client', 'gorelo_create_contact', 'gorelo_update_contact']) {
      expect(admin.has(name), name).toBe(true);
    }
    expect(admin.has('gorelo_create_alert')).toBe(false);
    expect(GENERATED_TOOLS.filter((t) => t.admin).every((t) => t.tier === 'write')).toBe(true);
  });

  it('is up to date with the committed spec (drift guard)', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'gorelo-gen-')), 'tools.ts');
    execFileSync(process.execPath, [join(ROOT, 'scripts/generate-tools.mjs'), '--out', out], { stdio: 'pipe' });
    expect(readFileSync(out, 'utf8')).toBe(readFileSync(join(ROOT, 'src/generated/tools.ts'), 'utf8'));
    expect(() => execFileSync(process.execPath, [join(ROOT, 'scripts/generate-tools.mjs'), '--check'], { stdio: 'pipe' })).not.toThrow();
  });
});
