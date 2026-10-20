import type { Tool, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { GENERATED_TOOLS } from '../generated/tools.js';
import type { GeneratedTool, ToolTier } from '../tool-types.js';

/**
 * Preset -> OpenAPI tags. A tool matches when any of its tags is listed.
 * Presets only narrow the tool set; the destructive tier still needs
 * GORELO_ENABLE_DESTRUCTIVE=true. `all` and `readonly` are tier-only.
 */
const TAG_PRESETS: Record<string, string[]> = {
  crm: ['Clients', 'Contacts', 'Organization'],
  tickets: ['Tickets', 'Contacts', 'Clients'],
  monitoring: ['Alerts', 'Assets'],
};
export const PRESET_NAMES = ['all', 'readonly', ...Object.keys(TAG_PRESETS)];

export class ToolConfigError extends Error {}

function csv(value: string | undefined): string[] {
  return (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

export function annotationsFor(tier: ToolTier): ToolAnnotations {
  if (tier === 'read') return { readOnlyHint: true };
  if (tier === 'write') return { readOnlyHint: false, destructiveHint: false };
  return { readOnlyHint: false, destructiveHint: true };
}

export function destructiveEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^(true|1)$/i.test((env.GORELO_ENABLE_DESTRUCTIVE ?? '').trim());
}

export function billingWritesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^(true|1)$/i.test((env.GORELO_ENABLE_BILLING_WRITES ?? '').trim());
}

/**
 * Tools enabled for this process: read always; write unless preset=readonly;
 * destructive only with GORELO_ENABLE_DESTRUCTIVE=true; billing writes (invoices,
 * payments, items) only with GORELO_ENABLE_BILLING_WRITES=true. Then the preset's tag
 * list, GORELO_TOOLS_INCLUDE (keep only matches) and GORELO_TOOLS_EXCLUDE
 * (drop matches) narrow further. Nothing here can widen the tier gate.
 */
export function selectTools(env: NodeJS.ProcessEnv = process.env, all: GeneratedTool[] = GENERATED_TOOLS): GeneratedTool[] {
  const preset = (env.GORELO_PRESET ?? 'all').trim().toLowerCase() || 'all';
  if (!PRESET_NAMES.includes(preset)) {
    throw new ToolConfigError(`Unknown GORELO_PRESET='${env.GORELO_PRESET}'. Valid presets: ${PRESET_NAMES.join(', ')}`);
  }
  const tags = TAG_PRESETS[preset];
  const destructive = destructiveEnabled(env);
  const billing = billingWritesEnabled(env);
  const include = csv(env.GORELO_TOOLS_INCLUDE).map(globToRegExp);
  const exclude = csv(env.GORELO_TOOLS_EXCLUDE).map(globToRegExp);

  const selected = all.filter((t) => {
    if (t.tier === 'write' && preset === 'readonly') return false;
    if (t.tier === 'destructive' && (!destructive || preset === 'readonly')) return false;
    if (t.billingWrite && (!billing || preset === 'readonly')) return false;
    if (tags && !t.tags.some((tag) => tags.includes(tag))) return false;
    if (include.length > 0 && !include.some((re) => re.test(t.name))) return false;
    if (exclude.some((re) => re.test(t.name))) return false;
    return true;
  });
  if (selected.length === 0) {
    throw new ToolConfigError('GORELO_PRESET / GORELO_TOOLS_INCLUDE / GORELO_TOOLS_EXCLUDE leave no Gorelo tools enabled.');
  }
  return selected;
}

export function toMcpTool(tool: GeneratedTool): Tool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: annotationsFor(tool.tier),
  };
}
