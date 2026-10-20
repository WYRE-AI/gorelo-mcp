export type ToolTier = 'read' | 'write' | 'destructive';

export interface GeneratedParam {
  /** Argument name exposed to the model. */
  arg: string;
  /** Parameter name sent to Gorelo. */
  wire: string;
  in: 'path' | 'query';
  /** Multi-value filter: arrays are joined with commas. */
  list?: boolean;
}

/** One Gorelo Public API operation, as emitted by scripts/generate-tools.mjs. */
export interface GeneratedTool {
  name: string;
  description: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Path template, e.g. /v1/tickets/{ticketId}. Always relative: the host comes from the region. */
  path: string;
  /** Primary OpenAPI tag. */
  tag: string;
  tags: string[];
  tier: ToolTier;
  /** Write that changes tenant identity, catalog or money; the gateway should require an admin tier. */
  admin?: boolean;
  /** Creates/modifies billing records (not time entries); needs GORELO_ENABLE_BILLING_WRITES=true. */
  billingWrite?: boolean;
  inputSchema: {
    type: 'object';
    properties: Record<string, object>;
    required?: string[];
  };
  params: GeneratedParam[];
  hasBody: boolean;
}
