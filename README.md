# Gorelo MCP Server

MCP server for [Gorelo](https://gorelo.io)'s PSA (Professional Services Automation) REST API - full Public API coverage (tickets, clients, contacts, assets, billing, projects, documents, alerts, and more) - for AI assistants and the WYRE Conduit gateway.

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
| `GORELO_PRESET`, `GORELO_ENABLE_DESTRUCTIVE`, `GORELO_ENABLE_BILLING_WRITES`, `GORELO_TOOLS_INCLUDE`, `GORELO_TOOLS_EXCLUDE` | Tool selection; see [Tool selection](#tool-selection). |
| `LOG_LEVEL` | `debug` \| `info` (default) \| `warn` \| `error`. |

`/health` stays unauthenticated, does not call `getCredentials()`, and does not return the API key. The stdio transport does not use `CONDUIT_S2S_SECRET`.

### HTTP authentication

With `MCP_TRANSPORT=http` and `CONDUIT_S2S_SECRET` set, every `/mcp` request must include `X-Gateway-S2S`. The value is `t=<unix seconds>,v1=<hex hmac-sha256>`, where the HMAC is SHA-256 over the literal string `t=<unix seconds>` using `CONDUIT_S2S_SECRET` as the key. A missing or invalid header returns 401. The proof is valid for five minutes of clock skew.

In `AUTH_MODE=gateway`, `/mcp` also requires `X-Gorelo-Api-Key`. `X-Gorelo-Region` is optional; when present it must be exactly `us` or `au`, and any other value returns 400. The API key header is the only credential source for the request. A missing key returns 401 and does not fall back to `GORELO_API_KEY`.

```http
POST /mcp HTTP/1.1
X-Gateway-S2S: t=1710000000,v1=<hmac-sha256 hex of "t=1710000000">
X-Gorelo-Api-Key: <tenant api key>
X-Gorelo-Region: us
```

## Tools

112 tools, generated at build time from Gorelo's OpenAPI spec (`spec/gorelo-openapi.json`, fetched 2026-10-20: 117 operations, 5 excluded). Names follow `gorelo_<verb>_<noun>`. The 24 read tools from earlier releases keep their names; their arguments are unchanged (camelCase filters such as `pageSize`/`statusIds` as arrays, and `id` for the `get_client`/`get_contact`/`get_asset`/`get_time_entry` tools).

Tiers follow the HTTP method:

| Tier | Methods | Count | Annotations | Default |
|---|---|---|---|---|
| read | GET | 58 | `readOnlyHint: true` | on |
| write | POST / PUT / PATCH | 36 | `readOnlyHint: false`, `destructiveHint: false` | on (the gateway gates writes), except billing writes (below) |
| destructive | DELETE | 18 | `readOnlyHint: false`, `destructiveHint: true` | **off**; set `GORELO_ENABLE_DESTRUCTIVE=true` |

Write tools marked *admin* create or change clients, contacts, the item catalog, invoices or payments.

Money is read-only by default: the four billing writes (`gorelo_create_invoice`, `gorelo_create_payment`, `gorelo_create_item`, `gorelo_update_item`; every non-DELETE write under the Billing tag except time entries) are hidden from `tools/list` and refused at call time unless `GORELO_ENABLE_BILLING_WRITES=true`. The `readonly` preset hides them regardless. Billing DELETEs are ordinary destructive tools. Time entry create/update are unaffected.

The machine-readable classification (`read` / `write` / `destructive` / `admin` / `billing_write` / `excluded_binary` / `excluded_sensitive`) comes from `node scripts/generate-tools.mjs --tiers <file>`.

Request bodies are passed under a single `body` argument (the JSON object Gorelo documents for that endpoint). Multi-value filters (`statusIds`, `clientIds`, ...) take an array, which is sent comma-joined.

### Alerts

| Tool | Tier | Description |
|---|---|---|
| `gorelo_list_alerts` | read | Lists alerts for the authenticated service provider. |
| `gorelo_create_alert` | write | Posts an external alert against a client for the service provider. |

### Assets

| Tool | Tier | Description |
|---|---|---|
| `gorelo_get_asset` | read | Gets a single agent (managed device) asset by id. |
| `gorelo_get_custom_asset` | read | Gets a single custom asset by id. |
| `gorelo_get_uptime` | read | Gets a single uptime check by id. |
| `gorelo_list_assets` | read | Lists agent (managed device) assets for the service provider using cursor pagination. Results are sorted by createdOn descending (newest first). |
| `gorelo_list_custom_asset_hardware_types` | read | Lists the hardware types a custom asset can be given. |
| `gorelo_list_custom_assets` | read | Lists custom (non-agent) assets for the service provider using cursor pagination. Results are sorted by createdOn descending (newest first). |
| `gorelo_list_uptimes` | read | Lists uptime checks for the service provider using cursor pagination. Results are sorted by createdOn descending (newest first). |
| `gorelo_create_custom_asset` | write | Creates a custom asset. |
| `gorelo_create_uptime` | write | Creates an uptime check. |
| `gorelo_update_custom_asset` | write | Updates a custom asset. Send only the fields you want to change. |
| `gorelo_update_uptime` | write | Updates an uptime check. Send only the fields you want to change. |
| `gorelo_delete_asset` | destructive | Deletes an agent (managed device) asset. |
| `gorelo_delete_custom_asset` | destructive | Deletes a custom asset. |
| `gorelo_delete_uptime` | destructive | Deletes an uptime check. |

### Billing

| Tool | Tier | Description |
|---|---|---|
| `gorelo_get_contract` | read | Everything about one contract, including each service line's actual products/labor. |
| `gorelo_get_invoice` | read | Gets one invoice, with its attachments and line items. |
| `gorelo_get_item` | read | A single catalog item — a product or a bundle. |
| `gorelo_get_time_entry` | read | Gets a single time entry by id. |
| `gorelo_list_billing_roles` | read | Lists the billing roles configured for the service provider. Use a role's Id as BillingRoleId when logging time against a ticket. |
| `gorelo_list_contracts` | read | Lists billing contracts, each with the service lines it is made of. |
| `gorelo_list_invoices` | read | Lists the service provider's invoices, filtered and sorted. |
| `gorelo_list_item_categories` | read | Lists the categories products are organised under, each with its subcategories. |
| `gorelo_list_items` | read | Lists the service provider's item catalog: products and bundles. |
| `gorelo_list_taxes` | read | Lists the tax rates configured for the service provider. |
| `gorelo_list_time_entries` | read | Lists logged time across every ticket and task, narrowed by any of the filters. |
| `gorelo_list_work_types` | read | Lists the work types configured for the service provider. Use a work type's Id as WorkTypeId when logging time against a ticket. |
| `gorelo_create_invoice` | write (admin, billing) | Raises a manual invoice against a client, with line items. |
| `gorelo_create_item` | write (admin, billing) | Creates a product or a bundle in the item catalog. |
| `gorelo_create_payment` | write (admin, billing) | Records a payment received outside Gorelo against an approved invoice. |
| `gorelo_create_time_entry` | write | Logs time against a ticket. |
| `gorelo_update_item` | write (admin, billing) | Partially updates an item. Send only the fields you want to change. |
| `gorelo_update_time_entry` | write | Partially updates a time entry. Send only the fields you want to change. |
| `gorelo_delete_contract` | destructive | Deletes a contract. |
| `gorelo_delete_invoice` | destructive | Deletes or voids an invoice, depending on its current status. |
| `gorelo_delete_item` | destructive | Deletes an item. |
| `gorelo_delete_payment` | destructive | Deletes a payment that was recorded through the API. |
| `gorelo_delete_time_entry` | destructive | Deletes a time entry. |

### Clients

| Tool | Tier | Description |
|---|---|---|
| `gorelo_get_client` | read | Gets a single client by id. |
| `gorelo_list_client_locations` | read | Lists the locations for a given client. |
| `gorelo_list_clients` | read | Lists clients for the service provider using cursor pagination. Results are sorted by client id ascending (oldest first). |
| `gorelo_create_client` | write (admin) | Creates a client (and its default location) for the service provider. |
| `gorelo_update_client` | write (admin) | Updates an existing client. Only supplied (non-null) fields are changed. |
| `gorelo_delete_client` | destructive | Deletes a client. |

### Contacts

| Tool | Tier | Description |
|---|---|---|
| `gorelo_get_contact` | read | Gets a single contact by id. |
| `gorelo_list_contacts` | read | Lists contacts for the service provider using cursor pagination, optionally filtered by client. Results are sorted by contact id ascending (oldest first). |
| `gorelo_create_contact` | write (admin) | Creates a contact under a client, or a temporary contact when no client is given. |
| `gorelo_update_contact` | write (admin) | Updates an existing contact. |
| `gorelo_delete_contact` | destructive | Deletes a contact. |

### Deletions

| Tool | Tier | Description |
|---|---|---|
| `gorelo_list_deletions` | read | Lists records that have been deleted, so a copy kept in sync through this API can remove them. Results are sorted by DeletedOn ascending, then type id, then id, using cursor pagination. |

### Documents

| Tool | Tier | Description |
|---|---|---|
| `gorelo_get_document` | read | Gets a single document. |
| `gorelo_get_document_version` | read | Gets one version of a document, with its body and attachments. |
| `gorelo_list_document_related_items` | read | Lists the records a document is related to. |
| `gorelo_list_document_versions` | read | Lists a document's versions, newest first. |
| `gorelo_list_documents` | read | Lists the service provider's documents. |
| `gorelo_create_document` | write | Creates a document. |
| `gorelo_create_document_related_item` | write | Relates a document to other records. |
| `gorelo_duplicate_document` | write | Duplicates a document. |
| `gorelo_restore_document_version` | write | Makes an earlier version the current one. |
| `gorelo_update_document` | write | Updates a document. |
| `gorelo_delete_document_related_item` | destructive | Removes one related item from a document. |

### Forms

| Tool | Tier | Description |
|---|---|---|
| `gorelo_list_form_responses` | read | Lists a form's submitted responses, newest first. |
| `gorelo_list_forms` | read | Lists the service provider's forms, most recently updated first. |
| `gorelo_create_form_submission_link` | write | Issues a link through which the form can be submitted. |

### Organization

| Tool | Tier | Description |
|---|---|---|
| `gorelo_list_api_keys` | read | Lists the service provider's API keys using cursor pagination, newest first. |
| `gorelo_list_groups` | read | Lists the technician groups configured for the service provider. |
| `gorelo_list_users` | read | Lists users (technicians) for the service provider using cursor pagination. Results are sorted by user id ascending (oldest first). |

### Projects

| Tool | Tier | Description |
|---|---|---|
| `gorelo_get_project` | read | Gets a single project. |
| `gorelo_get_project_comment` | read | Returns one comment on a project. |
| `gorelo_get_project_task` | read | Returns one task in full. |
| `gorelo_get_project_task_approval` | read | Gets one approval on a task, with its approvers. |
| `gorelo_get_project_task_comment` | read | Returns one comment on a task. |
| `gorelo_list_project_comments` | read | Returns a project's comments, newest first. |
| `gorelo_list_project_sections` | read | Lists a project's sections. |
| `gorelo_list_project_tags` | read | Lists the project tags configured for the service provider. |
| `gorelo_list_project_task_comments` | read | Returns a task's comments, newest first. |
| `gorelo_list_project_task_conversations` | read | Lists the conversations on a task. |
| `gorelo_list_project_tasks` | read | Lists a project's tasks. |
| `gorelo_list_project_types` | read | Lists the project types configured for the service provider. |
| `gorelo_list_projects` | read | Lists the projects visible to the authenticated service provider, newest activity first. |
| `gorelo_create_project` | write | Creates a project for the authenticated service provider. |
| `gorelo_create_project_comment` | write | Posts a comment on a project. |
| `gorelo_create_project_section` | write | Adds a section to a project. |
| `gorelo_create_project_task` | write | Creates a task on a project's board. |
| `gorelo_create_project_task_approval` | write | Asks contacts to approve something on a task. |
| `gorelo_create_project_task_comment` | write | Posts a comment on a task. |
| `gorelo_create_project_task_side_conversation` | write | Starts a side conversation on a task. |
| `gorelo_update_project` | write | Updates a project. Send only the fields you want to change. |
| `gorelo_update_project_section` | write | Updates a section's title or colour. Send only the fields you want to change. |
| `gorelo_update_project_task` | write | Updates a task. Send only the fields you want to change. |
| `gorelo_delete_project` | destructive | Deletes a project and every task in it. |
| `gorelo_delete_project_comment` | destructive | Deletes one comment on a project. |
| `gorelo_delete_project_section` | destructive | Deletes a section and every task in it. |
| `gorelo_delete_project_task` | destructive | Deletes a task. |
| `gorelo_delete_project_task_comment` | destructive | Deletes one comment on a task. |

### Tickets

| Tool | Tier | Description |
|---|---|---|
| `gorelo_get_ticket` | read | Gets a single ticket. |
| `gorelo_get_ticket_approval` | read | Gets a single approval on a ticket, with its approvers. This is where approval status lives — the conversations list stays lean and does not carry it. |
| `gorelo_get_ticket_comment` | read | Gets a single comment on a ticket. Same shape as a comments-list item except that the full BodyHtml is always included, so there is no BodyTruncated field. |
| `gorelo_list_ticket_comments` | read | Lists the comments on a ticket using cursor pagination. Comments read oldest-first by default, like a conversation top to bottom. |
| `gorelo_list_ticket_conversations` | read | Lists the conversations on a ticket. |
| `gorelo_list_ticket_statuses` | read | Lists the ticket statuses configured for the service provider. |
| `gorelo_list_ticket_tags` | read | Lists the ticket tags configured for the service provider. |
| `gorelo_list_ticket_types` | read | Lists the ticket types configured for the service provider. |
| `gorelo_list_tickets` | read | Lists tickets for the service provider using cursor pagination. Default sort is updatedOn desc. |
| `gorelo_create_ticket` | write | Creates a ticket for the authenticated service provider. |
| `gorelo_create_ticket_approval` | write | Creates an approval on a ticket. Every listed contact starts Pending. |
| `gorelo_create_ticket_comment` | write | Adds a comment to a ticket. The comment is always recorded as coming from the API — the caller cannot post as a specific user, and To and Cc are taken from the conversation rather than the request. |
| `gorelo_create_ticket_side_conversation` | write | Creates a side conversation on a ticket. Post a comment into it afterward using this conversation's returned Id as conversationId with conversationType=3. |
| `gorelo_update_ticket` | write | Partially updates a ticket. Send only the fields you want to change. |
| `gorelo_delete_ticket` | destructive | Deletes a ticket and its time entries. |
| `gorelo_delete_ticket_comment` | destructive | Deletes a private comment from a ticket. |

### tools/list size

Measured as the JSON size of the `tools/list` result (names, descriptions, input schemas, annotations):

| Configuration | Tools | Bytes |
|---|---|---|
| `GORELO_PRESET=readonly` | 58 | 39,718 |
| default (read + write, no billing writes) | 90 | 87,530 |
| `GORELO_ENABLE_DESTRUCTIVE=true` + `GORELO_ENABLE_BILLING_WRITES=true` (everything) | 112 | 102,064 |

Use a preset or `GORELO_TOOLS_INCLUDE` to shrink the list for clients with tight context budgets.

### Tool selection

| Env var | Description |
|---|---|
| `GORELO_PRESET` | `all` (default: read + write), `readonly` (read only), `crm` (Clients, Contacts, Organization), `tickets` (Tickets, Contacts, Clients), `monitoring` (Alerts, Assets). Tag presets match any of an operation's OpenAPI tags. Unknown values refuse to start. |
| `GORELO_ENABLE_DESTRUCTIVE` | `true` enables the DELETE tools. Anything else leaves them off. Presets and filters never enable them. |
| `GORELO_ENABLE_BILLING_WRITES` | `true` enables invoice, payment and item create/update. Default off; presets and filters never enable them. |
| `GORELO_TOOLS_INCLUDE` | Comma-separated name globs (`*`, `?`); keep only matching tools, e.g. `gorelo_*_ticket*,gorelo_list_clients`. |
| `GORELO_TOOLS_EXCLUDE` | Comma-separated name globs; drop matching tools. |

Presets and filters only narrow the set. A tool hidden from `tools/list` is also refused if called by name. Selection that leaves zero tools refuses to start.

### Exclusions

Five operations are deliberately not exposed. Three because the Conduit gateway has no confirmed binary tool-result or upload path:

| Operation | Reason |
|---|---|
| `POST /v1/attachments` | multipart file upload |
| `GET /v1/invoices/{invoiceId}/pdf` | returns a binary PDF |
| `GET /v1/documents/{documentId}/pdf` | returns a binary PDF |

The list lives in `EXCLUDED_BINARY` in `scripts/generate-tools.mjs`.

Two more are never exposed under any configuration: `POST /v1/api-keys` and `DELETE /v1/api-keys/{apiKeyId}` (`EXCLUDED_SENSITIVE`; credential minting/revocation is out of scope for an AI tool surface). `gorelo_list_api_keys` stays: it returns key metadata only (id, name, scopes, dates), never the key value.

### Behavior

- One generic executor runs every tool: path parameters are URL-encoded, the host is always the region's fixed base URL (`us` / `au`), and redirects are refused.
- HTTP 429 is retried up to 3 times (honoring `Retry-After`, capped at 15s, else exponential backoff).
- Responses over 100KB are truncated with an explicit `[TRUNCATED: ...]` marker; narrow with filters or `pageSize` and follow the cursor.
- 403 returns `Gorelo API key lacks permission for <tool> (HTTP 403). Check the key's scopes in Gorelo → Settings → API.` 401, 404 and 422 have their own messages. The API key is never included in errors or logs.

### Regenerating

```bash
npm run generate         # rewrite src/generated/tools.ts from spec/gorelo-openapi.json
npm run generate:check   # exit 1 if the committed file is stale (also enforced by a test and CI)
```

To pick up a new Gorelo API version, replace `spec/gorelo-openapi.json`, run `npm run generate`, review the diff (new operations need no code unless they use a body format other than JSON, which the generator rejects loudly), and commit both files.

## Attribution

The operation-to-tool approach, retry/backoff and size-guard logic are adapted from [peetinc/gorelo-mcp-all](https://github.com/peetinc/gorelo-mcp-all) (MIT, Copyright (c) 2026 peetinc). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Development

```bash
npm install
npm run generate   # only after changing spec/gorelo-openapi.json
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
