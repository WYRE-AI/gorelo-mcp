import { AsyncLocalStorage } from 'node:async_hooks';
import { logger } from './utils/logger.js';
import type {
  GoreloApproval,
  GoreloBillingRole,
  GoreloClient,
  GoreloClientLocation,
  GoreloComment,
  GoreloContact,
  GoreloContract,
  GoreloConversation,
  GoreloCredentials,
  GoreloCustomAsset,
  GoreloDevice,
  GoreloGroup,
  GoreloItemResponse,
  GoreloListResponse,
  GoreloRegion,
  GoreloTicket,
  GoreloTicketStatus,
  GoreloTicketTag,
  GoreloTicketType,
  GoreloTimeEntry,
  GoreloUser,
  GoreloWorkType,
} from './types.js';

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

function authHeaders(creds: GoreloCredentials): Record<string, string> {
  return { 'X-API-Key': creds.apiKey, Accept: 'application/json' };
}

/** Joins array values with commas (Gorelo's convention for multi-id filters) and drops undefined/null entries. */
function buildQuery(params: Record<string, unknown>): URLSearchParams {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      qs.set(key, value.join(','));
    } else {
      qs.set(key, String(value));
    }
  }
  return qs;
}

async function doGet<T>(creds: GoreloCredentials, path: string, query?: Record<string, unknown>): Promise<T> {
  const baseUrl = baseUrlForRegion(creds.region);
  const qs = query ? buildQuery(query).toString() : '';
  const res = await fetch(`${baseUrl}${path}${qs ? `?${qs}` : ''}`, {
    method: 'GET',
    headers: authHeaders(creds),
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 401) {
    throw new GoreloAuthError(`Gorelo rejected the API key (HTTP 401)`);
  }
  if (res.status === 403) {
    throw new GoreloForbiddenError(`Gorelo denied access - the API key lacks scope for ${path} (HTTP 403)`);
  }
  if (res.status === 429) {
    throw new GoreloRateLimitError(`Gorelo rate-limited this request to ${path} (HTTP 429)`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new GoreloApiError(
      `Gorelo GET ${path} failed: HTTP ${res.status}${text ? ` - ${text.slice(0, 300)}` : ''}`,
      res.status
    );
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------

export interface ListTicketsOptions {
  cursor?: string;
  pageSize?: number;
  sortBy?: 'updatedOn' | 'createdOn';
  sortOrder?: 'asc' | 'desc';
  statusIds?: number[];
  clientIds?: number[];
  priorityIds?: number[];
  typeIds?: number[];
  leadAssigneeIds?: number[];
  contactIds?: number[];
  tagIds?: number[];
  groupIds?: number[];
  query?: string;
  updatedSince?: string;
  updatedBefore?: string;
  createdSince?: string;
  createdBefore?: string;
}

/** GET /v1/tickets - cursor-paginated ticket list, default sort updatedOn desc. */
export async function listTickets(
  creds: GoreloCredentials,
  opts: ListTicketsOptions = {}
): Promise<GoreloListResponse<GoreloTicket>> {
  return doGet<GoreloListResponse<GoreloTicket>>(creds, '/v1/tickets', {
    Cursor: opts.cursor,
    PageSize: opts.pageSize,
    SortBy: opts.sortBy,
    SortOrder: opts.sortOrder,
    StatusIds: opts.statusIds,
    ClientIds: opts.clientIds,
    PriorityIds: opts.priorityIds,
    TypeIds: opts.typeIds,
    LeadAssigneeIds: opts.leadAssigneeIds,
    ContactIds: opts.contactIds,
    TagIds: opts.tagIds,
    GroupIds: opts.groupIds,
    Query: opts.query,
    UpdatedSince: opts.updatedSince,
    UpdatedBefore: opts.updatedBefore,
    CreatedSince: opts.createdSince,
    CreatedBefore: opts.createdBefore,
  });
}

/** GET /v1/tickets/{ticketId} - a single ticket's full detail. */
export async function getTicket(creds: GoreloCredentials, ticketId: string): Promise<GoreloItemResponse<GoreloTicket>> {
  return doGet<GoreloItemResponse<GoreloTicket>>(creds, `/v1/tickets/${encodeURIComponent(ticketId)}`);
}

/** GET /v1/tickets/statuses - ticket statuses configured for the service provider. */
export async function listTicketStatuses(creds: GoreloCredentials): Promise<GoreloListResponse<GoreloTicketStatus>> {
  return doGet<GoreloListResponse<GoreloTicketStatus>>(creds, '/v1/tickets/statuses');
}

/** GET /v1/tickets/tags - ticket tags configured for the service provider. */
export async function listTicketTags(creds: GoreloCredentials): Promise<GoreloListResponse<GoreloTicketTag>> {
  return doGet<GoreloListResponse<GoreloTicketTag>>(creds, '/v1/tickets/tags');
}

/** GET /v1/tickets/types - ticket types configured for the service provider. */
export async function listTicketTypes(creds: GoreloCredentials): Promise<GoreloListResponse<GoreloTicketType>> {
  return doGet<GoreloListResponse<GoreloTicketType>>(creds, '/v1/tickets/types');
}

export interface ListTicketCommentsOptions {
  conversationType?: string;
  conversationId?: string;
  cursor?: string;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/** GET /v1/tickets/{ticketId}/comments - comments on a ticket, oldest-first by default. */
export async function listTicketComments(
  creds: GoreloCredentials,
  ticketId: string,
  opts: ListTicketCommentsOptions = {}
): Promise<GoreloListResponse<GoreloComment>> {
  return doGet<GoreloListResponse<GoreloComment>>(creds, `/v1/tickets/${encodeURIComponent(ticketId)}/comments`, {
    ConversationType: opts.conversationType,
    ConversationId: opts.conversationId,
    Cursor: opts.cursor,
    PageSize: opts.pageSize,
    SortBy: opts.sortBy,
    SortOrder: opts.sortOrder,
  });
}

/** GET /v1/tickets/{ticketId}/comments/{commentId} - a single comment, always with the full BodyHtml. */
export async function getTicketComment(
  creds: GoreloCredentials,
  ticketId: string,
  commentId: string
): Promise<GoreloItemResponse<GoreloComment>> {
  return doGet<GoreloItemResponse<GoreloComment>>(
    creds,
    `/v1/tickets/${encodeURIComponent(ticketId)}/comments/${encodeURIComponent(commentId)}`
  );
}

/** GET /v1/tickets/{ticketId}/conversations - the ticket's main thread, side conversations, and approvals. */
export async function listTicketConversations(
  creds: GoreloCredentials,
  ticketId: string
): Promise<GoreloListResponse<GoreloConversation>> {
  return doGet<GoreloListResponse<GoreloConversation>>(creds, `/v1/tickets/${encodeURIComponent(ticketId)}/conversations`);
}

/** GET /v1/tickets/{ticketId}/approvals/{approvalId} - an approval's status and approvers. */
export async function getTicketApproval(
  creds: GoreloCredentials,
  ticketId: string,
  approvalId: string
): Promise<GoreloItemResponse<GoreloApproval>> {
  return doGet<GoreloItemResponse<GoreloApproval>>(
    creds,
    `/v1/tickets/${encodeURIComponent(ticketId)}/approvals/${encodeURIComponent(approvalId)}`
  );
}

// ---------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------

export interface ListClientsOptions {
  cursor?: string;
  pageSize?: number;
  statusIds?: number[];
  query?: string;
  updatedSince?: string;
  updatedBefore?: string;
  createdSince?: string;
  createdBefore?: string;
}

/** GET /v1/clients - cursor-paginated client list, sorted by id ascending. */
export async function listClients(
  creds: GoreloCredentials,
  opts: ListClientsOptions = {}
): Promise<GoreloListResponse<GoreloClient>> {
  return doGet<GoreloListResponse<GoreloClient>>(creds, '/v1/clients', {
    Cursor: opts.cursor,
    PageSize: opts.pageSize,
    StatusIds: opts.statusIds,
    Query: opts.query,
    UpdatedSince: opts.updatedSince,
    UpdatedBefore: opts.updatedBefore,
    CreatedSince: opts.createdSince,
    CreatedBefore: opts.createdBefore,
  });
}

/** GET /v1/clients/{id} - a single client by id. */
export async function getClient(creds: GoreloCredentials, id: number): Promise<GoreloItemResponse<GoreloClient>> {
  return doGet<GoreloItemResponse<GoreloClient>>(creds, `/v1/clients/${encodeURIComponent(String(id))}`);
}

/** GET /v1/clients/{clientId}/locations - locations for a given client. */
export async function listClientLocations(
  creds: GoreloCredentials,
  clientId: number
): Promise<GoreloListResponse<GoreloClientLocation>> {
  return doGet<GoreloListResponse<GoreloClientLocation>>(
    creds,
    `/v1/clients/${encodeURIComponent(String(clientId))}/locations`
  );
}

// ---------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------

export interface ListContactsOptions {
  clientId?: number;
  cursor?: string;
  pageSize?: number;
  clientIds?: number[];
  statusIds?: number[];
  query?: string;
  updatedSince?: string;
  updatedBefore?: string;
  createdSince?: string;
  createdBefore?: string;
}

/** GET /v1/contacts - cursor-paginated contact list, optionally filtered by client, sorted by id ascending. */
export async function listContacts(
  creds: GoreloCredentials,
  opts: ListContactsOptions = {}
): Promise<GoreloListResponse<GoreloContact>> {
  return doGet<GoreloListResponse<GoreloContact>>(creds, '/v1/contacts', {
    ClientId: opts.clientId,
    Cursor: opts.cursor,
    PageSize: opts.pageSize,
    ClientIds: opts.clientIds,
    StatusIds: opts.statusIds,
    Query: opts.query,
    UpdatedSince: opts.updatedSince,
    UpdatedBefore: opts.updatedBefore,
    CreatedSince: opts.createdSince,
    CreatedBefore: opts.createdBefore,
  });
}

/** GET /v1/contacts/{id} - a single contact by id. */
export async function getContact(creds: GoreloCredentials, id: number): Promise<GoreloItemResponse<GoreloContact>> {
  return doGet<GoreloItemResponse<GoreloContact>>(creds, `/v1/contacts/${encodeURIComponent(String(id))}`);
}

// ---------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------

export interface ListContractsOptions {
  cursor?: string;
  pageSize?: number;
  clientIds?: number[];
}

/** GET /v1/contracts - billing contracts with their service lines. */
export async function listContracts(
  creds: GoreloCredentials,
  opts: ListContractsOptions = {}
): Promise<GoreloListResponse<GoreloContract>> {
  return doGet<GoreloListResponse<GoreloContract>>(creds, '/v1/contracts', {
    Cursor: opts.cursor,
    PageSize: opts.pageSize,
    ClientIds: opts.clientIds,
  });
}

// ---------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------

export interface ListAssetsOptions {
  cursor?: string;
  pageSize?: number;
  statusIds?: number[];
  clientIds?: number[];
  query?: string;
  updatedSince?: string;
  updatedBefore?: string;
  createdSince?: string;
  createdBefore?: string;
}

/** GET /v1/assets/agents - agent (managed device) assets, newest-created first. */
export async function listAssets(
  creds: GoreloCredentials,
  opts: ListAssetsOptions = {}
): Promise<GoreloListResponse<GoreloDevice>> {
  return doGet<GoreloListResponse<GoreloDevice>>(creds, '/v1/assets/agents', {
    Cursor: opts.cursor,
    PageSize: opts.pageSize,
    StatusIds: opts.statusIds,
    ClientIds: opts.clientIds,
    Query: opts.query,
    UpdatedSince: opts.updatedSince,
    UpdatedBefore: opts.updatedBefore,
    CreatedSince: opts.createdSince,
    CreatedBefore: opts.createdBefore,
  });
}

/** GET /v1/assets/agents/{id} - a single agent asset by id. */
export async function getAsset(creds: GoreloCredentials, id: string): Promise<GoreloItemResponse<GoreloDevice>> {
  return doGet<GoreloItemResponse<GoreloDevice>>(creds, `/v1/assets/agents/${encodeURIComponent(id)}`);
}

export interface ListCustomAssetsOptions {
  cursor?: string;
  pageSize?: number;
  clientIds?: number[];
  query?: string;
  updatedSince?: string;
  updatedBefore?: string;
  createdSince?: string;
  createdBefore?: string;
}

/** GET /v1/assets/custom - custom (non-agent) assets, newest-created first. */
export async function listCustomAssets(
  creds: GoreloCredentials,
  opts: ListCustomAssetsOptions = {}
): Promise<GoreloListResponse<GoreloCustomAsset>> {
  return doGet<GoreloListResponse<GoreloCustomAsset>>(creds, '/v1/assets/custom', {
    Cursor: opts.cursor,
    PageSize: opts.pageSize,
    ClientIds: opts.clientIds,
    Query: opts.query,
    UpdatedSince: opts.updatedSince,
    UpdatedBefore: opts.updatedBefore,
    CreatedSince: opts.createdSince,
    CreatedBefore: opts.createdBefore,
  });
}

// ---------------------------------------------------------------------
// Time tracking / billing
// ---------------------------------------------------------------------

export interface ListTimeEntriesOptions {
  cursor?: string;
  pageSize?: number;
  clientIds?: number[];
  locationIds?: number[];
  ticketIds?: string[];
  taskIds?: string[];
  userIds?: number[];
  invoiceIds?: number[];
  startedSince?: string;
  startedBefore?: string;
  createdSince?: string;
  createdBefore?: string;
  updatedSince?: string;
  updatedBefore?: string;
}

/** GET /v1/time-entries - logged time across every ticket and task, narrowed by any filter. */
export async function listTimeEntries(
  creds: GoreloCredentials,
  opts: ListTimeEntriesOptions = {}
): Promise<GoreloListResponse<GoreloTimeEntry>> {
  return doGet<GoreloListResponse<GoreloTimeEntry>>(creds, '/v1/time-entries', {
    Cursor: opts.cursor,
    PageSize: opts.pageSize,
    ClientIds: opts.clientIds,
    LocationIds: opts.locationIds,
    TicketIds: opts.ticketIds,
    TaskIds: opts.taskIds,
    UserIds: opts.userIds,
    InvoiceIds: opts.invoiceIds,
    StartedSince: opts.startedSince,
    StartedBefore: opts.startedBefore,
    CreatedSince: opts.createdSince,
    CreatedBefore: opts.createdBefore,
    UpdatedSince: opts.updatedSince,
    UpdatedBefore: opts.updatedBefore,
  });
}

/** GET /v1/time-entries/{id} - a single time entry by id. */
export async function getTimeEntry(creds: GoreloCredentials, id: number): Promise<GoreloItemResponse<GoreloTimeEntry>> {
  return doGet<GoreloItemResponse<GoreloTimeEntry>>(creds, `/v1/time-entries/${encodeURIComponent(String(id))}`);
}

/** GET /v1/billing-roles - billing roles configured for the service provider. */
export async function listBillingRoles(creds: GoreloCredentials): Promise<GoreloListResponse<GoreloBillingRole>> {
  return doGet<GoreloListResponse<GoreloBillingRole>>(creds, '/v1/billing-roles');
}

/** GET /v1/work-types - work types configured for the service provider. */
export async function listWorkTypes(creds: GoreloCredentials): Promise<GoreloListResponse<GoreloWorkType>> {
  return doGet<GoreloListResponse<GoreloWorkType>>(creds, '/v1/work-types');
}

// ---------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------

export interface ListUsersOptions {
  cursor?: string;
  pageSize?: number;
}

/** GET /v1/organization/users - technicians for the service provider, sorted by id ascending. */
export async function listUsers(
  creds: GoreloCredentials,
  opts: ListUsersOptions = {}
): Promise<GoreloListResponse<GoreloUser>> {
  return doGet<GoreloListResponse<GoreloUser>>(creds, '/v1/organization/users', {
    Cursor: opts.cursor,
    PageSize: opts.pageSize,
  });
}

/** GET /v1/organization/groups - technician groups configured for the service provider. */
export async function listGroups(creds: GoreloCredentials): Promise<GoreloListResponse<GoreloGroup>> {
  return doGet<GoreloListResponse<GoreloGroup>>(creds, '/v1/organization/groups');
}
