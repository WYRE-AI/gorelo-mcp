import { AsyncLocalStorage } from 'node:async_hooks';
import { logger } from './utils/logger.js';
import type { GoreloCredentials, GoreloRegion } from './types.js';

/**
 * Gorelo's two regional API hosts. A tenant's account lives in exactly one
 * region; 'us' is the default and matches Gorelo's own onboarding default.
 */
const REGION_BASE_URLS: Record<GoreloRegion, string> = {
  us: 'https://api.usw.gorelo.io',
  au: 'https://api.aue.gorelo.io',
};

export function baseUrlForRegion(region?: string): string {
  if (region && Object.hasOwn(REGION_BASE_URLS, region)) {
    return REGION_BASE_URLS[region as GoreloRegion];
  }
  return REGION_BASE_URLS.us;
}

// Request-scoped credential store. In gateway mode the HTTP layer runs each
// request inside runWithCredentials({apiKey, region}); getCredentials()
// reads from it. Falls back to process.env for stdio/single-tenant mode.
const credStore = new AsyncLocalStorage<GoreloCredentials>();

export function runWithCredentials<T>(creds: GoreloCredentials, fn: () => T): T {
  return credStore.run(creds, fn);
}

export function getCredentials(): GoreloCredentials | null {
  const scoped = credStore.getStore();
  if (scoped?.apiKey) return scoped;
  const apiKey = process.env.GORELO_API_KEY;
  const region = process.env.GORELO_REGION;
  if (!apiKey) {
    logger.warn('Missing credentials', { hasApiKey: !!apiKey });
    return null;
  }
  return { apiKey, region: region as GoreloRegion | undefined };
}

/** Thrown on HTTP 401 - the API key itself is invalid or unrecognized. */
export class GoreloAuthError extends Error {}

/** Thrown on HTTP 403 - the API key is valid but lacks the scope for this endpoint (per Gorelo's own docs). */
export class GoreloForbiddenError extends Error {}

/** Thrown on HTTP 429 - the tenant has been rate-limited. */
export class GoreloRateLimitError extends Error {}

/** Thrown for any other non-2xx / unexpected vendor response. */
export class GoreloApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}
