# Gorelo MCP Server

MCP server for [Gorelo](https://gorelo.io)'s PSA (Professional Services Automation) REST API - ticket, client, contact, contract, asset, and time-tracking visibility - for AI assistants and the WYRE Conduit gateway.

## Authentication

Generate an API key for your Gorelo organization and send it as the `X-API-Key` header - this server handles that on every request. There is no token exchange.

## Configuration

Copy [`.env.example`](.env.example) and set the variables below.

| Env var | Description |
|---|---|
| `GORELO_API_KEY` | Gorelo Public API key for stdio and `AUTH_MODE=env`. Not read by the gateway Compose service. |
| `GORELO_REGION` | `us` (default) or `au` - your account's regional API host. Not a credential. |
| `MCP_TRANSPORT` | `stdio` (default) or `http`. |
| `AUTH_MODE` | `env` (default, reads the vars above) or `gateway` (credentials arrive per-request via `X-Gorelo-*` headers, injected by the Conduit gateway). Gateway mode never falls back to `GORELO_API_KEY`. The container image and Compose default to `gateway`. |
| `CONDUIT_S2S_SECRET` | Required to start the HTTP transport. The process logs an error and exits non-zero when this is empty or a known placeholder (`changeme`, `change-me`, `secret`, `example`, `placeholder`, `replace-me`, `your-secret`, `your-s2s-secret`, `s2s-secret`, `replace-with-a-real-secret`). Compose will not start without it. Never commit a real value. The value is never logged. |
| `MCP_ALLOW_INSECURE_DEV` | Set to exactly `1` only for local development to start HTTP without `CONDUIT_S2S_SECRET`. The process logs a warning, does not enforce `X-Gateway-S2S`, and binds `127.0.0.1` only. A non-loopback `MCP_HTTP_HOST` is overridden and logged. A placeholder secret still refuses to start. |
| `MCP_HTTP_HOST` | Bind address when a secret is configured. Unset means `0.0.0.0`. The container image sets `0.0.0.0`. Ignored in favor of `127.0.0.1` when there is no secret. |
| `MCP_HTTP_PORT` | HTTP port. Defaults to `8080`. |
| `LOG_LEVEL` | `debug` \| `info` (default) \| `warn` \| `error`. |

`/health` stays unauthenticated, does not call `getCredentials()`, and does not return the API key. The stdio transport does not use `CONDUIT_S2S_SECRET`.

### HTTP authentication

With `MCP_TRANSPORT=http` and `CONDUIT_S2S_SECRET` set, every `/mcp` request must include `X-Gateway-S2S`. The value is `t=<unix seconds>,v1=<hex hmac-sha256>`, where the HMAC is SHA-256 over the literal string `t=<unix seconds>` using `CONDUIT_S2S_SECRET` as the key. A missing or invalid header returns 401. The proof is valid for five minutes of clock skew.

In `AUTH_MODE=gateway`, `/mcp` also requires `X-Gorelo-Api-Key` (`X-Gorelo-Region` is optional, `us` or `au`). That header is the only credential source for the request. A missing key returns 401 and does not fall back to `GORELO_API_KEY`.

```http
POST /mcp HTTP/1.1
X-Gateway-S2S: t=1710000000,v1=<hmac-sha256 hex of "t=1710000000">
X-Gorelo-Api-Key: <tenant api key>
X-Gorelo-Region: us
```

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

The image listens on `0.0.0.0` inside the container (`MCP_HTTP_HOST`) and defaults to `AUTH_MODE=gateway`. Publish the port on loopback and pass a real S2S secret. In gateway mode, the Gorelo API key arrives on each request as `X-Gorelo-Api-Key`; it is not read from the environment. Do not pass a known placeholder such as `your-s2s-secret` or `changeme`. Startup treats those as unset and exits.

```bash
docker build -t gorelo-mcp .
docker run \
  -e CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" \
  -p 127.0.0.1:8080:8080 \
  gorelo-mcp
```

Compose refuses to start when `CONDUIT_S2S_SECRET` is unset, sets `AUTH_MODE=gateway`, does not pass `GORELO_API_KEY`, and publishes `127.0.0.1:8080:8080`. A project `.env` is interpolation only. Do not add `env_file` to the gateway service.

```bash
CONDUIT_S2S_SECRET="$(openssl rand -hex 32)" docker compose up
```

Single-tenant HTTP (`AUTH_MODE=env`) still requires the S2S secret, then uses `GORELO_API_KEY`:

```bash
docker run \
  -e CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" \
  -e AUTH_MODE=env \
  -e GORELO_API_KEY=your-value \
  -e GORELO_REGION=us \
  -p 127.0.0.1:8080:8080 \
  gorelo-mcp
```

Local HTTP without a secret is development-only. It binds `127.0.0.1` even if `MCP_HTTP_HOST` is `0.0.0.0`, and logs a warning:

```bash
MCP_TRANSPORT=http MCP_ALLOW_INSECURE_DEV=1 npm run start:http
```
