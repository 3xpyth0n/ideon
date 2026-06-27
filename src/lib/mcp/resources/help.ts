/**
 * MCP Resource: canvas://help
 *
 * Static Markdown guide describing available block types, data structures,
 * placement best practices, and usage examples.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const HELP_CONTENT = `# Ideon Canvas — AI Guide

## Block Types

| Type | Description | Default Size |
|------|-------------|--------------|
| text | Rich text note | 320×240 |
| link | External URL bookmark | 320×240 |
| file | Uploaded file attachment | 320×240 |
| snippet | Code snippet with syntax highlighting | 320×240 |
| checklist | Todo list with checkable items | 320×240 |
| kanban | Kanban board with columns and tasks | 1165×480 |
| sketch | Freehand drawing canvas | 600×450 |
| frame | Grouping container for other blocks | 600×400 |
| video | Embedded video player | 320×240 |
| contact | Contact card | 320×240 |
| github | GitHub repository/issue link | 320×240 |
| palette | Color palette | 320×240 |
| shell | Terminal/command output | 320×240 |
| folder | File folder reference | 320×240 |
| vercel | Vercel deployment link | 320×240 |
| webhook | Webhook endpoint | 320×240 |
| cron | Scheduled task | 320×240 |
| core | System block (read-only position) | 320×240 |

## Data Structures

### Block
\`\`\`json
{
  "id": "uuid",
  "type": "text",
  "position": { "x": 100, "y": 200 },
  "width": 320,
  "height": 240,
  "data": {
    "blockType": "text",
    "content": "Block content here",
    "metadata": {}
  }
}
\`\`\`

### Link (Connection)
\`\`\`json
{
  "id": "uuid",
  "source": "block-id-1",
  "target": "block-id-2",
  "type": "default",
  "label": "relates to"
}
\`\`\`

## Placement Best Practices

1. **Use anchorBlockId**: Place new blocks relative to existing ones to maintain spatial coherence.
2. **Direction matters**: Use \`right\` for sequential flow, \`down\` for hierarchy, \`left\`/\`up\` for backlinks.
3. **Batch creation**: Use \`create_blocks_batch\` for related blocks — they auto-arrange in a grid (max 5 columns).
4. **Let the engine decide**: Omit explicit position unless you have a specific reason. The placement engine avoids collisions.
5. **Proximity = relationship**: Place semantically related blocks near each other.
6. **Avoid overlap**: The engine uses a 40px minimum gap between blocks.

## Common Workflows

### Explore a project
1. Read \`canvas://project/{id}/overview\` for a quick summary
2. Use \`list_blocks\` to see all blocks with positions
3. Use \`get_block\` for full content of specific blocks

### Add content
1. \`list_blocks\` to find a good anchor point
2. \`create_block\` with \`anchorBlockId\` and \`direction\`
3. Optionally \`create_link\` to connect to related blocks

### Bulk operations
1. \`create_blocks_batch\` for multiple blocks at once
2. Then \`create_link\` to wire them together

### Kanban management
1. \`list_kanban_tasks\` to see current board state
2. \`create_kanban_task\` to add tasks
3. \`move_kanban_task\` to change task status

## Constraints

- Content max size: 100,000 characters
- Block width: 100–2000px
- Block height: 50–2000px
- Batch size: 1–50 blocks
- Link label: max 200 characters
- Self-links are not allowed
- Core blocks cannot be moved or deleted
`;

/**
 * Registers the canvas://help static resource.
 */
export function registerHelpResource(server: McpServer): void {
  server.resource(
    "canvas-help",
    "canvas://help",
    {
      description:
        "Static guide for AI agents: lists available block types, data structures, placement best practices, and example workflows for the Ideon canvas.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: HELP_CONTENT,
          },
        ],
      };
    },
  );
}
