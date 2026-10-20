#!/usr/bin/env node
/**
 * Build-time tool generator for the Gorelo Public API.
 *
 *   node scripts/generate-tools.mjs                  write src/generated/tools.ts
 *   node scripts/generate-tools.mjs --check          fail (exit 1) if the committed file is stale
 *   node scripts/generate-tools.mjs --out <file>     write somewhere else
 *   node scripts/generate-tools.mjs --tiers <file>   also write the tier classification JSON
 *
 * Reads the committed spec (spec/gorelo-openapi.json) and emits one MCP tool
 * per operation. Nothing is generated at server startup.
 *
 * The approach (OpenAPI operation -> flat MCP tool with a generic executor)
 * is modeled on peetinc/gorelo-mcp-all (MIT, Copyright (c) 2026 peetinc); see
 * THIRD_PARTY_NOTICES.md. Naming, schema compaction, tiers and the exclusion
 * list are specific to this repo.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_PATH = resolve(ROOT, 'spec/gorelo-openapi.json');
const DEFAULT_OUT = resolve(ROOT, 'src/generated/tools.ts');

/**
 * Operations deliberately not exposed. The Conduit gateway has no confirmed
 * binary tool-result or upload path, so multipart uploads and PDF downloads
 * cannot round-trip through it.
 */
export const EXCLUDED_BINARY = [
  { method: 'POST', path: '/v1/attachments', reason: 'multipart/form-data file upload; no confirmed binary upload path through the Conduit gateway' },
  { method: 'GET', path: '/v1/invoices/{invoiceId}/pdf', reason: 'returns a binary PDF; no confirmed binary tool-result path through the Conduit gateway' },
  { method: 'GET', path: '/v1/documents/{documentId}/pdf', reason: 'returns a binary PDF; no confirmed binary tool-result path through the Conduit gateway' },
];

/**
 * Operations never exposed, whatever the configuration. Minting or revoking
 * credentials is not something an AI tool surface should be able to do.
 * (GET /v1/api-keys stays: ApiKeyModel carries metadata only, no key value.)
 */
export const EXCLUDED_SENSITIVE = [
  { method: 'POST', path: '/v1/api-keys', reason: 'credential minting/revocation is out of scope for an AI tool surface' },
  { method: 'DELETE', path: '/v1/api-keys/{apiKeyId}', reason: 'credential minting/revocation is out of scope for an AI tool surface' },
];

/**
 * Tool names that shipped in the original hand-written server. They must not
 * change (Conduit baseline). Keyed by "METHOD path". `args` renames a spec
 * parameter to the argument name the old tool used (key = spec name).
 */
const LEGACY = {
  'GET /v1/tickets': { name: 'gorelo_list_tickets' },
  'GET /v1/tickets/{ticketId}': { name: 'gorelo_get_ticket' },
  'GET /v1/tickets/statuses': { name: 'gorelo_list_ticket_statuses' },
  'GET /v1/tickets/tags': { name: 'gorelo_list_ticket_tags' },
  'GET /v1/tickets/types': { name: 'gorelo_list_ticket_types' },
  'GET /v1/tickets/{ticketId}/comments': { name: 'gorelo_list_ticket_comments' },
  'GET /v1/tickets/{ticketId}/comments/{commentId}': { name: 'gorelo_get_ticket_comment' },
  'GET /v1/tickets/{ticketId}/conversations': { name: 'gorelo_list_ticket_conversations' },
  'GET /v1/tickets/{ticketId}/approvals/{approvalId}': { name: 'gorelo_get_ticket_approval' },
  'GET /v1/clients': { name: 'gorelo_list_clients' },
  'GET /v1/clients/{clientId}': { name: 'gorelo_get_client', args: { clientId: 'id' } },
  'GET /v1/clients/{clientId}/locations': { name: 'gorelo_list_client_locations' },
  'GET /v1/contacts': { name: 'gorelo_list_contacts' },
  'GET /v1/contacts/{contactId}': { name: 'gorelo_get_contact', args: { contactId: 'id' } },
  'GET /v1/contracts': { name: 'gorelo_list_contracts' },
  'GET /v1/assets/agents': { name: 'gorelo_list_assets' },
  'GET /v1/assets/agents/{deviceId}': { name: 'gorelo_get_asset', args: { deviceId: 'id' } },
  'GET /v1/assets/custom': { name: 'gorelo_list_custom_assets' },
  'GET /v1/time-entries': { name: 'gorelo_list_time_entries' },
  'GET /v1/time-entries/{timeEntryId}': { name: 'gorelo_get_time_entry', args: { timeEntryId: 'id' } },
  'GET /v1/billing-roles': { name: 'gorelo_list_billing_roles' },
  'GET /v1/work-types': { name: 'gorelo_list_work_types' },
  'GET /v1/organization/users': { name: 'gorelo_list_users' },
  'GET /v1/organization/groups': { name: 'gorelo_list_groups' },
};

/** Path prefixes rewritten to a noun before naming. */
const SEGMENT_ALIASES = [
  ['assets/agents', 'asset'],
  ['assets/custom', 'custom_asset'],
  ['organization/', ''],
];

/** Trailing path segments that name an action rather than a resource. */
const ACTION_SEGMENTS = { duplicate: 'duplicate', restore: 'restore' };

/**
 * Writes that change who/what the tenant is (clients, contacts, API keys),
 * the item catalog, or money (invoices, payments). Flagged so the gateway can
 * require an admin tier. Raising an alert or commenting on a ticket is not.
 */
const ADMIN_TAGS = new Set(['Clients', 'Contacts', 'Organization']);
const ADMIN_NAMES = new Set(['gorelo_create_item', 'gorelo_update_item', 'gorelo_create_invoice', 'gorelo_create_payment']);

/**
 * Billing writes are off unless GORELO_ENABLE_BILLING_WRITES=true. Time entries (also tagged Billing) are
 * exempt: logging time is day-to-day ticket work.
 */
const BILLING_WRITE_EXEMPT_PATHS = ['/v1/time-entries'];
const isBillingWrite = (tier, tags, path) =>
  tier === 'write' && tags.includes('Billing') && !BILLING_WRITE_EXEMPT_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

const MAX_DESC = 200;
const MAX_PARAM_DESC = 150;
const MAX_PROP_DESC = 110;
const MAX_REF_DEPTH = 6;

const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// ---------------------------------------------------------------- text utils
function clean(text) {
  return String(text ?? '')
    .replace(/\r/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > max * 0.6 ? space : cut.length).replace(/[,;:\s]+$/, '')}…`;
}

/** Keeps whole sentences while they fit in `max`; at least the first one (truncated). */
function sentences(text, max) {
  const parts = clean(text).match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? [];
  let out = '';
  for (const part of parts) {
    const next = out ? `${out} ${part.trim()}` : part.trim();
    if (next.length > max) break;
    out = next;
  }
  return out || truncate(clean(text), max);
}

function singular(word) {
  if (/ies$/.test(word)) return `${word.slice(0, -3)}y`;
  if (/(ss|us|is)$/.test(word)) return word; // status, address
  if (/(sses|uses|xes|ches|shes)$/.test(word)) return word.slice(0, -2);
  if (word === 'statuses') return 'status';
  if (/s$/.test(word)) return word.slice(0, -1);
  return word;
}

function plural(word) {
  if (/(s|x|ch|sh)$/.test(word)) return word === 'status' ? 'statuses' : `${word}es`;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

const snake = (s) => s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// --------------------------------------------------------------------- naming
function deriveName(method, path) {
  let rest = path.replace(/^\/v\d+\//, '');
  for (const [from, to] of SEGMENT_ALIASES) {
    if (rest.startsWith(from)) rest = to + rest.slice(from.length);
  }
  let segments = rest.split('/').filter(Boolean);
  let action = null;
  const last = segments[segments.length - 1];
  if (last && ACTION_SEGMENTS[last]) {
    action = ACTION_SEGMENTS[last];
    segments = segments.slice(0, -1);
  } else if (method === 'POST' && segments.length >= 2 && segments[segments.length - 2] === 'conversations') {
    // .../conversations/approval|side-conversation -> create_<parent>_approval
    segments = [...segments.slice(0, -2), last];
  }
  const endsWithParam = segments[segments.length - 1]?.startsWith('{');
  const statics = segments.filter((s) => !s.startsWith('{')).map(snake);
  // Every segment but the last is a singular qualifier; the last is plural
  // only when the operation addresses a collection (a list).
  const qualifiers = statics.slice(0, -1).map(singular);
  const tail = singular(statics[statics.length - 1] ?? '');
  const noun = method === 'GET' && !endsWithParam && !action ? plural(tail) : tail;
  const verb = action ?? { GET: endsWithParam ? 'get' : 'list', POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' }[method];
  return `gorelo_${verb}_${[...qualifiers, noun].join('_')}`.replace(/_+/g, '_');
}

// ------------------------------------------------------------------- schemas
function resolveRef(ref) {
  const node = ref.replace(/^#\//, '').split('/').reduce((o, k) => o?.[k], spec);
  if (!node) throw new Error(`Unresolved $ref ${ref}`);
  return node;
}

/** Compact JSON schema: structure, enums and short descriptions only. */
function compact(schema, stack = [], depth = 0) {
  if (schema.$ref) {
    if (stack.includes(schema.$ref) || depth > MAX_REF_DEPTH) return { type: 'object' };
    return compact(resolveRef(schema.$ref), [...stack, schema.$ref], depth + 1);
  }
  for (const key of ['allOf', 'oneOf', 'anyOf']) {
    if (schema[key]) throw new Error(`Unsupported ${key} in schema; extend compact()`);
  }
  const out = {};
  if (schema.type) out.type = schema.type;
  if (schema.enum) out.enum = schema.enum;
  const desc = schema.description ? sentences(schema.description, MAX_PROP_DESC) : '';
  if (desc) out.description = desc;
  if (schema.properties) {
    out.properties = {};
    for (const [k, v] of Object.entries(schema.properties)) out.properties[k] = compact(v, stack, depth + 1);
    if (schema.required?.length) out.required = [...schema.required];
  }
  if (schema.items) out.items = compact(schema.items, stack, depth + 1);
  return out;
}

/** Multi-value filters whose items are strings (guids, names), not integer ids. */
const STRING_ID_PARAMS = new Set(['Skus', 'Vendors', 'PartNumbers', 'TicketIds', 'TaskIds', 'DeviceIds', 'SectionIds', 'ConversationType']);

function paramSchema(param) {
  const desc = sentences(param.description ?? '', MAX_PARAM_DESC);
  const s = param.schema ?? { type: 'string' };
  // Gorelo takes multi-value filters as one comma-separated string; expose an
  // array (the executor joins it) so callers don't hand-build the string.
  if (/comma-separated|^kinds to include/i.test(param.description ?? '')) {
    const itemType = STRING_ID_PARAMS.has(param.name) || /guid|uuid/i.test(param.description ?? '') ? 'string' : 'integer';
    return { type: 'array', items: { type: itemType }, description: desc.replace(/^comma-separated /i, '') };
  }
  const out = { type: s.type === 'integer' ? 'integer' : s.type === 'boolean' ? 'boolean' : 'string' };
  if (s.enum) out.enum = s.enum;
  if (desc) out.description = desc;
  return out;
}

// --------------------------------------------------------------------- build
function buildTools() {
  const tools = [];
  const excluded = [];
  const exclusionKeys = new Set(EXCLUDED_BINARY.map((e) => `${e.method} ${e.path}`));
  const sensitiveKeys = new Set(EXCLUDED_SENSITIVE.map((e) => `${e.method} ${e.path}`));
  const excludedSensitive = [];
  const seenExclusions = new Set();

  for (const [path, item] of Object.entries(spec.paths)) {
    for (const m of METHODS) {
      const op = item[m];
      if (!op) continue;
      const method = m.toUpperCase();
      const key = `${method} ${path}`;
      if (sensitiveKeys.has(key)) {
        seenExclusions.add(key);
        excludedSensitive.push(deriveName(method, path));
        continue;
      }
      if (exclusionKeys.has(key)) {
        seenExclusions.add(key);
        excluded.push(key);
        continue;
      }

      const legacy = LEGACY[key];
      const renames = legacy?.args ?? {};
      const properties = {};
      const required = [];
      const params = [];

      for (const p of op.parameters ?? []) {
        if (p.in !== 'path' && p.in !== 'query') throw new Error(`${key}: unsupported parameter location ${p.in}`);
        const argName = p.in === 'path' ? (renames[p.name] ?? p.name) : lowerFirst(p.name);
        if (properties[argName]) throw new Error(`${key}: duplicate argument ${argName}`);
        const isArray = /comma-separated|^kinds to include/i.test(p.description ?? '');
        properties[argName] = paramSchema(p);
        const req = p.in === 'path' || Boolean(p.required) || /^required\b/i.test(p.description ?? '');
        if (req) required.push(argName);
        params.push({ arg: argName, wire: p.name, in: p.in, ...(isArray ? { list: true } : {}) });
      }

      let hasBody = false;
      if (op.requestBody) {
        const content = op.requestBody.content ?? {};
        const jsonType = ['application/json', 'application/json-patch+json', 'text/json'].find((t) => content[t]);
        if (!jsonType) throw new Error(`${key}: non-JSON request body (${Object.keys(content)}); add to EXCLUDED_BINARY or support it`);
        if (properties.body) throw new Error(`${key}: parameter named body clashes with request body`);
        hasBody = true;
        const body = compact(content[jsonType].schema);
        body.description = body.description ?? sentences(op.requestBody.description ?? 'Request body.', MAX_PROP_DESC);
        properties.body = body;
        required.push('body');
      }

      const name = legacy?.name ?? deriveName(method, path);
      const tier = method === 'GET' ? 'read' : method === 'DELETE' ? 'destructive' : 'write';
      const tags = op.tags ?? [];
      tools.push({
        name,
        description: sentences(op.summary ?? '', MAX_DESC),
        method,
        path,
        tag: tags[0] ?? 'Other',
        tags,
        tier,
        ...(isBillingWrite(tier, tags, path) ? { billingWrite: true } : {}),
        ...(tier === 'write' && (tags.some((t) => ADMIN_TAGS.has(t) && t === tags[0]) || ADMIN_NAMES.has(name)) ? { admin: true } : {}),
        inputSchema: { type: 'object', properties, ...(required.length ? { required } : {}) },
        params,
        hasBody,
      });
    }
  }

  for (const key of [...exclusionKeys, ...sensitiveKeys]) {
    if (!seenExclusions.has(key)) throw new Error(`Exclusion ${key} is not in the spec; update EXCLUDED_BINARY / EXCLUDED_SENSITIVE`);
  }
  for (const key of Object.keys(LEGACY)) {
    if (!tools.some((t) => `${t.method} ${t.path}` === key)) throw new Error(`Legacy mapping ${key} is not in the spec`);
  }

  const names = new Map();
  for (const t of tools) {
    if (names.has(t.name)) throw new Error(`Duplicate tool name ${t.name}: ${names.get(t.name)} vs ${t.method} ${t.path}`);
    if (!/^gorelo_[a-z0-9_]+$/.test(t.name)) throw new Error(`Bad tool name ${t.name}`);
    if (t.description.length > MAX_DESC + 1) throw new Error(`Description too long for ${t.name}`);
    names.set(t.name, `${t.method} ${t.path}`);
  }
  tools.sort((a, b) => (a.tag === b.tag ? a.path.localeCompare(b.path) || a.method.localeCompare(b.method) : a.tag.localeCompare(b.tag)));
  return { tools, excluded, excludedSensitive };
}

function render(tools) {
  const header = `// AUTO-GENERATED by scripts/generate-tools.mjs from spec/gorelo-openapi.json.
// Do not edit by hand: run \`npm run generate\`. CI fails if this file drifts.
// Operation -> tool approach modeled on peetinc/gorelo-mcp-all (MIT, Copyright (c) 2026 peetinc).
// See THIRD_PARTY_NOTICES.md.
import type { GeneratedTool } from '../tool-types.js';

export const GENERATED_TOOLS: GeneratedTool[] = `;
  return `${header}${JSON.stringify(tools, null, 2)};\n`;
}

function tiersJson(tools, excluded, excludedSensitive) {
  const by = (tier) => tools.filter((t) => t.tier === tier).map((t) => t.name).sort();
  return {
    read: by('read'),
    write: by('write'),
    destructive: by('destructive'),
    admin: tools.filter((t) => t.admin).map((t) => t.name).sort(),
    billing_write: tools.filter((t) => t.billingWrite).map((t) => t.name).sort(),
    excluded_binary: excluded.sort(),
    excluded_sensitive: excludedSensitive.sort(),
  };
}

// ----------------------------------------------------------------------- main
const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? resolve(args[i + 1]) : undefined;
};
const { tools, excluded, excludedSensitive } = buildTools();
const output = render(tools);

if (args.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(DEFAULT_OUT, 'utf8');
  } catch {
    /* missing counts as stale */
  }
  if (current !== output) {
    console.error('src/generated/tools.ts is out of date. Run `npm run generate` and commit the result.');
    process.exit(1);
  }
  console.log(`src/generated/tools.ts is up to date (${tools.length} tools).`);
} else {
  const out = argValue('--out') ?? DEFAULT_OUT;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, output);
  console.log(`Wrote ${tools.length} tools to ${out}`);
}
const tiersOut = argValue('--tiers');
if (tiersOut) {
  mkdirSync(dirname(tiersOut), { recursive: true });
  writeFileSync(tiersOut, `${JSON.stringify(tiersJson(tools, excluded, excludedSensitive), null, 2)}\n`);
  console.log(`Wrote tier classification to ${tiersOut}`);
}
