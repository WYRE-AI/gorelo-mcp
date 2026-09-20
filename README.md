# Gorelo MCP Server

MCP server for [Gorelo](https://gorelo.io)'s PSA (Professional Services Automation) REST API - ticket, client, contact, contract, asset, and time-tracking visibility - for AI assistants and the WYRE Conduit gateway.

## Authentication

Generate an API key for your Gorelo organization and send it as the `X-API-Key` header - this server handles that on every request. There is no token exchange.

## Configuration

| Env var | Description |
|---|---|
| `GORELO_API_KEY` | Gorelo Public API key for the tenant. |
| `GORELO_REGION` | `us` (default) or `au` - your account's regional API host. |
| `MCP_TRANSPORT` | `stdio` (default) or `http`. |
| `AUTH_MODE` | `env` (default, reads the vars above) or `gateway` (credentials arrive per-request via `X-Gorelo-*` headers, injected by the Conduit gateway). |
| `CONDUIT_S2S_SECRET` | When set, the HTTP transport requires a valid `X-Gateway-S2S` header (Conduit sidecar auth) on every `/mcp` request. |
| `LOG_LEVEL` | `debug` \| `info` (default) \| `warn` \| `error`. |

## Tools

### Tickets
- `gorelo_list_tickets` - list tickets, filterable by status/client/priority/type/assignee/contact/tag/group/keyword/date range.
- `gorelo_get_ticket` - get a single ticket's full detail.
- `gorelo_list_ticket_statuses` - list configured ticket statuses.
- `gorelo_list_ticket_tags` - list configured ticket tags.
- `gorelo_list_ticket_types` - list configured ticket types.
- `gorelo_list_ticket_comments` - list comments on a ticket.
- `gorelo_get_ticket_comment` - get a single comment on a ticket.
- `gorelo_list_ticket_conversations` - list a ticket's main thread, side conversations, and approvals.
- `gorelo_get_ticket_approval` - get a single approval's status and approvers.

### Clients
- `gorelo_list_clients` - list clients.
- `gorelo_get_client` - get a single client.
- `gorelo_list_client_locations` - list a client's locations.

### Contacts
- `gorelo_list_contacts` - list contacts, optionally filtered by client.
- `gorelo_get_contact` - get a single contact.

### Contracts
- `gorelo_list_contracts` - list billing contracts and their service lines.

### Assets
- `gorelo_list_assets` - list agent (managed device) assets.
- `gorelo_get_asset` - get a single agent asset.
- `gorelo_list_custom_assets` - list custom (non-agent) assets.

### Time Tracking
- `gorelo_list_time_entries` - list logged time across tickets and tasks.
- `gorelo_get_time_entry` - get a single time entry.
- `gorelo_list_billing_roles` - list configured billing roles.
- `gorelo_list_work_types` - list configured work types.

### Organization
- `gorelo_list_users` - list users (technicians).
- `gorelo_list_groups` - list technician groups.

## Scope

This is a v1 read-only surface: every tool is a `GET` against Gorelo's Public API. Every write action (creating or updating tickets/comments/clients/contacts/time entries, posting external alerts, uploading attachments, and all delete endpoints) is out of scope for this release and can be added as a follow-up once there's a concrete need for it.

`GET /v1/invoices/{id}/pdf` is also out of scope: it returns a binary PDF rather than JSON, and this wave's connectors treat binary report/document endpoints as a separate concern from structured data visibility.

## Development

```bash
npm install
npm run build
npm test
npm run lint   # tsc --noEmit
```

## Docker

```bash
docker build -t gorelo-mcp .
docker run -p 8080:8080 \
  -e GORELO_API_KEY=... \
  gorelo-mcp
```
