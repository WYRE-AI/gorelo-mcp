import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { selectTools } from './tools/index.js';
import { logger } from './utils/logger.js';

selectTools(); // fail fast on a bad GORELO_PRESET / filter config
const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);
logger.info('Gorelo MCP server started (stdio)');
