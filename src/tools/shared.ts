import type { GoreloCredentials } from '../types.js';
import type { CallToolResult } from './types.js';

export function textResult(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

export function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

/** Returns an error CallToolResult if credentials are missing, else null. */
export function requireCredentials(creds: GoreloCredentials | null): CallToolResult | null {
  if (!creds) {
    return errorResult('No Gorelo credentials configured. Set GORELO_API_KEY (and optionally GORELO_REGION).');
  }
  return null;
}
