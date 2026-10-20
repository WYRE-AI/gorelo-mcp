/**
 * Generic executor for generated Gorelo tools.
 *
 * Portions adapted from peetinc/gorelo-mcp-all (src/gorelo-client.ts):
 * the 429 retry/backoff loop, Retry-After parsing, path-parameter encoding
 * and the response-size guard.
 *
 * MIT License - Copyright (c) 2026 peetinc
 * Full license text: THIRD_PARTY_NOTICES.md
 */
import { getCredentials, baseUrlForRegion, GoreloApiError, GoreloAuthError, GoreloForbiddenError, GoreloRateLimitError } from './client.js';
import type { GeneratedTool } from './tool-types.js';
import type { GoreloCredentials, GoreloError } from './types.js';

export const MAX_RESPONSE_BYTES = 100 * 1024;
export const MAX_RETRIES = 3;
const MAX_BACKOFF_MS = 15_000;
const READ_TIMEOUT_MS = 15_000;
const WRITE_TIMEOUT_MS = 30_000;

export class ToolArgumentError extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry-After as milliseconds (delta-seconds or HTTP date); null when absent or unparseable. */
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number.parseInt(header, 10);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

function requireList(names: string[]): string {
  return names.length === 1 ? `${names[0]} is required.` : `${names.join(' and ')} are required.`;
}

/** Checks required args and rejects unknown ones (a typo'd filter would otherwise silently return unfiltered data). */
function validateArgs(tool: GeneratedTool, args: Record<string, unknown>): void {
  const missing = (tool.inputSchema.required ?? []).filter((name) => {
    const value = args[name];
    return value === undefined || value === null || value === '';
  });
  if (missing.length > 0) throw new ToolArgumentError(requireList(missing));

  const known = new Set(Object.keys(tool.inputSchema.properties));
  const unknown = Object.keys(args).filter((name) => !known.has(name));
  if (unknown.length > 0) {
    throw new ToolArgumentError(`Unknown argument(s) for ${tool.name}: ${unknown.join(', ')}. Valid: ${[...known].join(', ') || '(none)'}.`);
  }
}

function fillPath(tool: GeneratedTool, args: Record<string, unknown>): string {
  let path = tool.path;
  for (const param of tool.params) {
    if (param.in !== 'path') continue;
    const value = String(args[param.arg]);
    // encodeURIComponent leaves "." and ".." intact, which fetch would normalize into a different route.
    if (value === '.' || value === '..') throw new ToolArgumentError(`${param.arg} is not a valid identifier.`);
    path = path.replace(`{${param.wire}}`, encodeURIComponent(value));
  }
  return path;
}

/** Multi-id filters go out comma-joined (Gorelo's convention); undefined, null and empty values are dropped. */
function buildQuery(tool: GeneratedTool, args: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const param of tool.params) {
    if (param.in !== 'query') continue;
    const value = args[param.arg];
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) qs.set(param.wire, value.join(','));
    } else if (typeof value === 'object') {
      throw new ToolArgumentError(`${param.arg} must be a string, number, boolean or array.`);
    } else {
      qs.set(param.wire, String(value));
    }
  }
  const text = qs.toString();
  return text ? `?${text}` : '';
}

function buildBody(tool: GeneratedTool, args: Record<string, unknown>): string | undefined {
  if (!tool.hasBody) return undefined;
  let body = args.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      throw new ToolArgumentError('body must be a JSON object.');
    }
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ToolArgumentError('body must be a JSON object.');
  }
  return JSON.stringify(body);
}

/** Notification messages from a Gorelo error envelope, if the body has one. */
function notificationText(text: string): string {
  try {
    const notes = (JSON.parse(text) as { Notifications?: GoreloError[] }).Notifications;
    const messages = (notes ?? []).map((n) => n.Message).filter((m): m is string => Boolean(m));
    if (messages.length > 0) return messages.join('; ');
  } catch {
    /* not an envelope */
  }
  return text;
}

function failure(tool: GeneratedTool, status: number, text: string): Error {
  const detail = notificationText(text).slice(0, 500);
  const suffix = detail ? `: ${detail}` : '';
  switch (status) {
    case 401:
      return new GoreloAuthError('Gorelo rejected the API key (HTTP 401). Check the key and region.');
    case 403:
      return new GoreloForbiddenError(
        `Gorelo API key lacks permission for ${tool.name} (HTTP 403). Check the key's scopes in Gorelo → Settings → API.`
      );
    case 404:
      return new GoreloApiError(`Not found (HTTP 404) for ${tool.name}: the id does not exist or is not visible to this key${suffix}`, 404);
    case 400:
    case 422:
      return new GoreloApiError(`Gorelo rejected the request to ${tool.name} (HTTP ${status})${suffix}`, status);
    case 429:
      return new GoreloRateLimitError(`Gorelo rate limit still exceeded for ${tool.name} after ${MAX_RETRIES} retries (HTTP 429). Try again shortly.`);
    default:
      return new GoreloApiError(`Gorelo ${tool.method} ${tool.name} failed (HTTP ${status})${suffix}`, status);
  }
}

/** Serializes a response, capping it at MAX_RESPONSE_BYTES with an explicit marker. */
function renderBody(text: string, status: number): string {
  if (text.length === 0) return JSON.stringify({ ok: true, status });
  let out = text;
  try {
    out = JSON.stringify(JSON.parse(text));
  } catch {
    /* non-JSON success body: return as-is */
  }
  const bytes = Buffer.byteLength(out, 'utf8');
  if (bytes <= MAX_RESPONSE_BYTES) return out;
  const head = Buffer.from(out, 'utf8').subarray(0, MAX_RESPONSE_BYTES).toString('utf8').replace(/�$/, '');
  return `${head}\n[TRUNCATED: response was ${bytes} bytes, limit ${MAX_RESPONSE_BYTES}. Narrow the query with filters or a smaller pageSize and follow the cursor.]`;
}

export async function executeTool(
  tool: GeneratedTool,
  rawArgs: Record<string, unknown>,
  creds: GoreloCredentials | null = getCredentials()
): Promise<string> {
  if (!creds) throw new ToolArgumentError('No Gorelo credentials configured. Set GORELO_API_KEY (and optionally GORELO_REGION).');
  validateArgs(tool, rawArgs);

  // Host is always the region's fixed base URL and the path comes from the
  // generated template, so a caller cannot redirect the request elsewhere.
  const url = `${baseUrlForRegion(creds.region)}${fillPath(tool, rawArgs)}${buildQuery(tool, rawArgs)}`;
  const body = buildBody(tool, rawArgs);
  const headers: Record<string, string> = { 'X-API-Key': creds.apiKey, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const timeout = tool.method === 'GET' ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { method: tool.method, headers, body, signal: AbortSignal.timeout(timeout), redirect: 'error' });
    if (res.status === 429 && attempt < MAX_RETRIES) {
      await res.body?.cancel().catch(() => undefined);
      const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
      await sleep(Math.min(retryAfter ?? 1000 * 2 ** attempt, MAX_BACKOFF_MS));
      continue;
    }
    const text = await res.text().catch(() => '');
    if (!res.ok) throw failure(tool, res.status, text);
    return renderBody(text, res.status);
  }
}
