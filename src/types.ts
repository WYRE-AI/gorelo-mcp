/**
 * Long-lived credentials for Gorelo's Public API. A single `apiKey` is
 * issued per tenant and sent as the `X-API-Key` header on every request -
 * there is no token exchange. `region` selects which of Gorelo's two
 * regional API hosts to call; it defaults to 'us' and is NOT secret. See
 * client.ts.
 */
export interface GoreloCredentials {
  apiKey: string;
  region?: GoreloRegion;
}

/** Gorelo's two regional API hosts (US and Australia). */
export type GoreloRegion = 'us' | 'au';

/** A single entry in a non-2xx response's `Notifications` array. */
export interface GoreloError {
  Code?: string;
  Message?: string;
  PropertyName?: string | null;
  ActionHint?: string | null;
  DocUrl?: string | null;
}
