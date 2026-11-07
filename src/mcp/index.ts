#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import * as path from 'path';
import { VbEngine } from '../core/vbEngine';

// Global engine instance
const engine = new VbEngine();
let isIndexed = false;
let currentWorkspace = process.cwd();

async function ensureIndexed(targetDir?: string): Promise<void> {
  const dir = path.resolve(targetDir || currentWorkspace);
  if (!isIndexed || engine.getWorkspaceDir() !== dir) {
    console.error(`[vb-mcp] Indexing workspace: ${dir}...`);
    const summary = await engine.indexWorkspace(dir);
    currentWorkspace = dir;
    isIndexed = true;
    console.error(
      `[vb-mcp] Indexed ${summary.fileCount} files, ${summary.symbolCount} procedures in ${summary.durationMs}ms.`
    );
  }
}

// Check for CLI Mode execution (e.g. `node out/mcp/index.js --def CalculateSalary .`)
async function handleCliMode(): Promise<boolean> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    return false;
  }

  const firstArg = args[0];
  if (!firstArg.startsWith('--') && !firstArg.startsWith('-')) {
    // If it's a directory path, use it as default workspace for MCP server
    currentWorkspace = path.resolve(firstArg);
    return false;
  }

  if (firstArg === '--help' || firstArg === '-h') {
    console.log(`
VB Definition & References Navigator - MCP Server & CLI Tool

USAGE:
  # Run as MCP Server (stdio transport for AI Agents):
  node out/mcp/index.js [workspace_path]

  # Run as standalone CLI query:
  node out/mcp/index.js --def <symbol> [workspace_path]
  node out/mcp/index.js --refs <symbol> [workspace_path]
  node out/mcp/index.js --list [workspace_path]
  node out/mcp/index.js --vni <text>
`);
    process.exit(0);
  }

  if (firstArg === '--vni') {
    const text = args.slice(1).join(' ');
    console.log(engine.convertVni(text, 'vni_to_utf8'));
    process.exit(0);
  }

  const workspace = args[2] ? path.resolve(args[2]) : process.cwd();
  await ensureIndexed(workspace);

  if (firstArg === '--def') {
    const symbol = args[1];
    if (!symbol) {
      console.error('Error: Symbol name required for --def');
      process.exit(1);
    }
    const defs = engine.getDefinitions(symbol);
    console.log(JSON.stringify(defs, null, 2));
    process.exit(0);
  }

  if (firstArg === '--refs') {
    const symbol = args[1];
    if (!symbol) {
      console.error('Error: Symbol name required for --refs');
      process.exit(1);
    }
    const refs = engine.findReferences(symbol);
    console.log(JSON.stringify(refs, null, 2));
    process.exit(0);
  }

  if (firstArg === '--list') {
    const list = engine.listSymbols();
    console.log(JSON.stringify(list, null, 2));
    process.exit(0);
  }

  return false;
}

const TOOLS: Tool[] = [
  {
    name: 'vb_find_definition',
    description:
      'Instantly locates the declaration, signature, docstrings, and location of a VB/VBA/VB.NET procedure (Sub, Function, Property) using O(1) in-memory index.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'The name of the procedure, function, or property to find.'
        },
        workspace: {
          type: 'string',
          description: 'Optional path to the VB workspace directory (defaults to current directory).'
        }
      },
      required: ['symbol']
    }
  },
  {
    name: 'vb_find_references',
    description:
      'Finds all call sites and usages of a procedure across the workspace, ignoring comments and string literals.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'The identifier to search references for.'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 50).'
        },
        include_declaration: {
          type: 'boolean',
          description: 'Whether to include the declaration line in the results (default: false).'
        },
        workspace: {
          type: 'string',
          description: 'Optional path to the VB workspace directory.'
        }
      },
      required: ['symbol']
    }
  },
  {
    name: 'vb_list_symbols',
    description:
      'Lists all procedures (Sub, Function, Property) declared in a specific file or across the entire workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Optional relative or absolute path to a specific VB file.'
        },
        query: {
          type: 'string',
          description: 'Optional case-insensitive substring filter for symbol name.'
        },
        workspace: {
          type: 'string',
          description: 'Optional path to the VB workspace directory.'
        }
      }
    }
  },
  {
    name: 'vb_convert_vni',
    description:
      'Converts legacy Access 97 / VB VNI-Windows encoded strings or comments to standard Unicode UTF-8, or vice versa.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text to convert.'
        },
        direction: {
          type: 'string',
          enum: ['vni_to_utf8', 'utf8_to_vni'],
          description: 'Conversion direction: "vni_to_utf8" (default) or "utf8_to_vni".'
        }
      },
      required: ['text']
    }
  },
  {
    name: 'vb_reindex',
    description: 'Forces a full re-scan and in-memory re-index of the VB workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: {
          type: 'string',
          description: 'Optional path to the VB workspace directory.'
        }
      }
    }
  }
];

async function startMcpServer() {
  const server = new Server(
    {
      name: 'vb-definition-navigator',
      version: '0.4.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === 'vb_find_definition') {
        const symbol = String(args?.symbol || '');
        const workspace = args?.workspace ? String(args.workspace) : undefined;
        await ensureIndexed(workspace);

        const defs = engine.getDefinitions(symbol);
        if (defs.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No definition found for procedure: "${symbol}" in workspace: ${currentWorkspace}`
              }
            ]
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(defs, null, 2)
            }
          ]
        };
      }

      if (name === 'vb_find_references') {
        const symbol = String(args?.symbol || '');
        const limit = typeof args?.limit === 'number' ? args.limit : 50;
        const includeDeclaration = Boolean(args?.include_declaration);
        const workspace = args?.workspace ? String(args.workspace) : undefined;
        await ensureIndexed(workspace);

        const refs = engine.findReferences(symbol, {
          limit,
          includeDeclaration
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  symbol,
                  count: refs.length,
                  references: refs
                },
                null,
                2
              )
            }
          ]
        };
      }

      if (name === 'vb_list_symbols') {
        const filePath = args?.file_path ? String(args.file_path) : undefined;
        const query = args?.query ? String(args.query) : undefined;
        const workspace = args?.workspace ? String(args.workspace) : undefined;
        await ensureIndexed(workspace);

        const symbols = engine.listSymbols({ filePath, query });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  count: symbols.length,
                  symbols
                },
                null,
                2
              )
            }
          ]
        };
      }

      if (name === 'vb_convert_vni') {
        const text = String(args?.text || '');
        const direction = args?.direction === 'utf8_to_vni' ? 'utf8_to_vni' : 'vni_to_utf8';
        const converted = engine.convertVni(text, direction);
        return {
          content: [
            {
              type: 'text',
              text: converted
            }
          ]
        };
      }

      if (name === 'vb_reindex') {
        const workspace = args?.workspace ? String(args.workspace) : undefined;
        isIndexed = false;
        await ensureIndexed(workspace);
        return {
          content: [
            {
              type: 'text',
              text: `Re-indexed workspace: ${currentWorkspace}`
            }
          ]
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (err: any) {
      console.error(`[vb-mcp] Error handling tool ${name}:`, err);
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error executing ${name}: ${err?.message || String(err)}`
          }
        ]
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[vb-mcp] VB Definition Navigator MCP server running on stdio.');
}

async function main() {
  const isCli = await handleCliMode();
  if (!isCli) {
    await startMcpServer();
  }
}

main().catch((err) => {
  console.error('[vb-mcp] Fatal error:', err);
  process.exit(1);
});
