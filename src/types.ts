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

/** Cursor-pagination metadata carried in a list response's `DataContext.Pagination`. */
export interface GoreloPagination {
  NextCursor?: string | null;
  PreviousCursor?: string | null;
  HasMore?: boolean;
  HasPrevious?: boolean;
  TotalCount?: number;
}

/** Envelope every Gorelo list endpoint returns: `{ StatusCode, IsSuccess, Data, DataContext, Notifications }`. */
export interface GoreloListResponse<T> {
  StatusCode?: number;
  IsSuccess?: boolean;
  Data?: T[] | null;
  DataContext?: { Pagination?: GoreloPagination } | null;
  Notifications?: GoreloError[];
}

/** Envelope every Gorelo single-item endpoint returns. */
export interface GoreloItemResponse<T> {
  StatusCode?: number;
  IsSuccess?: boolean;
  Data?: T | null;
  Notifications?: GoreloError[];
}

/** A small `{ Id, Name }` reference used throughout the API for statuses, priorities, etc. */
export interface GoreloCodeModel {
  Id?: number;
  Name?: string;
}

/** A pointer to the ticket or task a record (e.g. a time entry) hangs off. */
export interface GoreloNumberedReference {
  Id?: string;
  Number?: string;
  Title?: string;
}

// ---------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------

export interface GoreloTicket {
  Id?: string;
  Title?: string;
  Number?: number | null;
  DisplayNumber?: string;
  ClientId?: number | null;
  LocationId?: number | null;
  ContactId?: number | null;
  CcContactIds?: number[];
  LeadAssigneeId?: number | null;
  AssistingAssigneeIds?: number[];
  GroupIds?: number[];
  Status?: GoreloCodeModel;
  Priority?: GoreloCodeModel;
  Type?: GoreloCodeModel;
  TagIds?: number[];
  Description?: string;
  CreatedOn?: string | null;
  UpdatedOn?: string | null;
  ClosedOn?: string | null;
  [key: string]: unknown;
}

export interface GoreloComment {
  Id?: string;
  ConversationId?: string | null;
  ConversationType?: GoreloCodeModel;
  Source?: string;
  BodyHtml?: string;
  BodyText?: string;
  BodyTruncated?: boolean;
  Author?: Record<string, unknown>;
  Attachments?: Record<string, unknown>[];
  CreatedOn?: string | null;
  UpdatedOn?: string | null;
  [key: string]: unknown;
}

export interface GoreloConversation {
  Id?: string | null;
  Type?: GoreloCodeModel;
  Name?: string;
  Email?: string;
  CcEmails?: string[];
  CreatedOn?: string | null;
  [key: string]: unknown;
}

export interface GoreloApproval {
  Id?: string;
  Type?: GoreloCodeModel;
  Name?: string;
  Status?: string;
  Approvers?: Record<string, unknown>[];
  CreatedOn?: string | null;
  [key: string]: unknown;
}

export interface GoreloTicketStatus {
  Id?: number;
  Name?: string;
  BaseStatusId?: number;
  Color?: string;
  SortOrder?: number;
  Description?: string;
  [key: string]: unknown;
}

export interface GoreloTicketTag {
  Id?: number;
  Name?: string;
  Description?: string;
  IsAiTag?: boolean;
  [key: string]: unknown;
}

export interface GoreloTicketType {
  Id?: number;
  Name?: string;
  Description?: string;
  IsAiType?: boolean;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------

export interface GoreloClientWebDomain {
  Id?: number;
  Name?: string;
  ExpirationDate?: string | null;
  StatusId?: number;
  [key: string]: unknown;
}

export interface GoreloClient {
  Id?: number;
  Name?: string;
  Status?: GoreloCodeModel;
  BillingName?: string;
  AlternateName?: string;
  IsDefault?: boolean | null;
  Domains?: GoreloClientWebDomain[];
  CreatedOn?: string | null;
  UpdatedOn?: string | null;
  [key: string]: unknown;
}

export interface GoreloClientLocation {
  Id?: number;
  Name?: string;
  ClientId?: number;
  PrimaryContactId?: number | null;
  Address1?: string;
  Address2?: string;
  City?: string;
  State?: string;
  Country?: string;
  PostalCode?: string;
  TimeZone?: string;
  IsDefault?: boolean;
  IsDefaultBilling?: boolean;
  CreatedOn?: string | null;
  UpdatedOn?: string | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------

export interface GoreloContact {
  Id?: number;
  FirstName?: string;
  LastName?: string;
  Status?: GoreloCodeModel;
  ClientId?: number | null;
  LocationId?: number | null;
  PrimaryEmail?: string;
  Alias?: string;
  MobilePhone?: string;
  CreatedOn?: string | null;
  UpdatedOn?: string | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------

export interface GoreloContract {
  Id?: number;
  Name?: string;
  Status?: GoreloCodeModel;
  ClientId?: number;
  LocationIds?: number[];
  Reference?: string;
  CreatedOn?: string | null;
  UpdatedOn?: string | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------

export interface GoreloDevice {
  Id?: string;
  Name?: string;
  DisplayName?: string;
  Status?: GoreloCodeModel;
  ClientId?: number | null;
  LocationId?: number | null;
  Description?: string;
  TimeZone?: string;
  CreatedOn?: string;
  UpdatedOn?: string | null;
  [key: string]: unknown;
}

export interface GoreloCustomAsset {
  Id?: number;
  Name?: string;
  ClientId?: number;
  LocationId?: number | null;
  Description?: string;
  HardwareType?: string;
  SerialNumber?: string;
  WarrantyEndDate?: string | null;
  IpAddress?: string;
  CreatedOn?: string | null;
  UpdatedOn?: string | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------
// Time tracking / billing
// ---------------------------------------------------------------------

export interface GoreloTimeEntry {
  Id?: number;
  Ticket?: GoreloNumberedReference;
  Task?: GoreloNumberedReference;
  User?: GoreloCodeModel;
  StartedOn?: string | null;
  EndedOn?: string | null;
  ActualHours?: number | null;
  AdjustedHours?: number | null;
  [key: string]: unknown;
}

export interface GoreloBillingRole {
  Id?: number;
  Name?: string;
  HourlyRate?: number;
  CoaCode?: string;
  Tax?: unknown;
  [key: string]: unknown;
}

export interface GoreloWorkType {
  Id?: number;
  Name?: string;
  HourlyMultiplier?: number;
  IsDefaultOutsideBusinessHours?: boolean;
  BillableStatus?: unknown;
  MinimumTimeInMinutes?: number;
  IncrementTimeInMinutes?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------

export interface GoreloUser {
  Id?: number;
  FirstName?: string;
  LastName?: string;
  Status?: GoreloCodeModel;
  Email?: string;
  TimeZone?: string;
  CreatedOn?: string;
  UpdatedOn?: string | null;
  [key: string]: unknown;
}

export interface GoreloGroup {
  Id?: number;
  Name?: string;
  Alias?: string;
  OutboundEmail?: string;
  CreatedOn?: string | null;
  UpdatedOn?: string | null;
  [key: string]: unknown;
}
