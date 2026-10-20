# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security
- HTTP startup rejects an empty or known-placeholder `CONDUIT_S2S_SECRET`. `MCP_ALLOW_INSECURE_DEV=1` is the only bypass, skips `X-Gateway-S2S`, and binds `127.0.0.1` only.
- `AUTH_MODE=gateway` requires `X-Gorelo-Api-Key` on each `/mcp` request and does not fall back to `GORELO_API_KEY`.
- `X-Gorelo-Region` accepts only `us` or `au`. Any other value returns 400 and is not sent to a regional API host.

### Changed
- Uptime tools are renamed to `gorelo_{list_uptime_checks,get_uptime_check,create_uptime_check,update_uptime_check,delete_uptime_check}`.
- Reviewed tool descriptions live in `DESCRIPTION_OVERRIDES` in `scripts/generate-tools.mjs`. Every delete tool says it is destructive. Disabled-tool and 403 error messages are reworded.
- Credential minting is never exposed: `POST /v1/api-keys` and `DELETE /v1/api-keys/{apiKeyId}` (`gorelo_create_api_key`, `gorelo_delete_api_key`) are excluded by the generator (`EXCLUDED_SENSITIVE`). `gorelo_list_api_keys` is kept; it returns no secret material.
- Money is read-only by default: `gorelo_create_invoice`, `gorelo_create_payment`, `gorelo_create_item`, `gorelo_update_item` are listed and callable only with `GORELO_ENABLE_BILLING_WRITES=true` (default off), enforced at listing and call time. Time entry create/update are unaffected.

### Added
- Full Gorelo Public API coverage (WYREAI-518): 112 tools generated at build time from `spec/gorelo-openapi.json` by `scripts/generate-tools.mjs` into the committed `src/generated/tools.ts` (58 read, 36 write, 18 destructive). The 24 existing tool names are unchanged. A single generic executor replaces the hand-written handlers; `npm run generate:check`, a test and CI fail on drift.
- Tool selection: `GORELO_PRESET` (`all`, `readonly`, `crm`, `tickets`, `monitoring`), `GORELO_ENABLE_DESTRUCTIVE` (DELETE tools are off by default), `GORELO_TOOLS_INCLUDE` / `GORELO_TOOLS_EXCLUDE` globs. Annotations: `readOnlyHint` / `destructiveHint` per tier.
- Bounded retry on HTTP 429, 100KB response cap with a truncation marker, clear 401/403/404/422 errors.
- `THIRD_PARTY_NOTICES.md` for code adapted from peetinc/gorelo-mcp-all (MIT).
- Initial release: MCP server for Gorelo's PSA REST API.
- Ticket tools: `gorelo_list_tickets`, `gorelo_get_ticket`, `gorelo_list_ticket_statuses`, `gorelo_list_ticket_tags`, `gorelo_list_ticket_types`, `gorelo_list_ticket_comments`, `gorelo_get_ticket_comment`, `gorelo_list_ticket_conversations`, `gorelo_get_ticket_approval`.
- Client tools: `gorelo_list_clients`, `gorelo_get_client`, `gorelo_list_client_locations`.
- Contact tools: `gorelo_list_contacts`, `gorelo_get_contact`.
- Contract tool: `gorelo_list_contracts`.
- Asset tools: `gorelo_list_assets`, `gorelo_get_asset`, `gorelo_list_custom_assets`.
- Time-tracking tools: `gorelo_list_time_entries`, `gorelo_get_time_entry`, `gorelo_list_billing_roles`, `gorelo_list_work_types`.
- Organization tools: `gorelo_list_users`, `gorelo_list_groups`.
- Single-header `X-API-Key` authentication with distinct error classes for HTTP 401 (invalid key), 403 (insufficient scope), and 429 (rate limited).
- Regional endpoint support (`us`/`au`) via the `GORELO_REGION` credential field.

### Changed
- Unknown tool arguments are now rejected instead of ignored, and missing required arguments are reported together.
- Tool results are compact JSON rather than pretty-printed.
- Binary endpoints stay out of scope: `POST /v1/attachments`, `GET /v1/invoices/{invoiceId}/pdf`, `GET /v1/documents/{documentId}/pdf`.

### Removed
- Hand-written per-resource tool modules and typed GET client functions (`src/tools/*.ts`, `listTickets`, `getClient`, ...), superseded by the generated tools.
