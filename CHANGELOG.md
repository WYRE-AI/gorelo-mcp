# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security
- HTTP startup rejects an empty or known-placeholder `CONDUIT_S2S_SECRET`. `MCP_ALLOW_INSECURE_DEV=1` is the only bypass, skips `X-Gateway-S2S`, and binds `127.0.0.1` only.
- `AUTH_MODE=gateway` requires `X-Gorelo-Api-Key` on each `/mcp` request and does not fall back to `GORELO_API_KEY`.
- `X-Gorelo-Region` accepts only `us` or `au`. Any other value returns 400 and is not sent to a regional API host.

### Added
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
