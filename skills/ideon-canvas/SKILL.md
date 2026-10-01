---
name: ideon-canvas
description: Use Ideon's MCP server to inspect and automate project canvases, including frames, linked blocks, and kanban tasks.
---

# Ideon Canvas

Use this skill when an agent needs to read or update an Ideon project canvas through the Model Context Protocol (MCP).

## Connect

Ideon exposes a stateless Streamable HTTP MCP endpoint at `$IDEON_URL/api/mcp`.

- Configure an MCP client with the endpoint and `Authorization: Bearer $IDEON_API_KEY`.
- For direct HTTP requests, send `Content-Type: application/json` and `Accept: application/json, text/event-stream`.
- Keep API keys in environment variables or the MCP client's secret store. Never put a real key in prompts, examples, source control, or logs.
- Generate and revoke keys from the Ideon account's Developers settings.

The skill can be installed from the Ideon repository with:

```sh
npx skills add 3xpyth0n/ideon --skill ideon-canvas
```

## Workflow

1. Call `list_projects` and ask which existing project to use if the target is ambiguous. MCP does not create projects.
2. Call `get_project` and read `canvas://project/{projectId}/overview` before editing.
3. Call `list_blocks` to understand existing content and positions. Reuse nearby context instead of creating duplicates.
4. Use `create_blocks_batch` for related blocks, or `create_block` with `anchorBlockId` and `direction` for relative placement.
5. Use `create_link` to express relationships between existing block IDs.
6. Verify changes with `list_blocks`, `list_links`, or `get_block`.

Write tools require editor access. Ask before deleting blocks or making broad changes. Do not expose project content or API keys outside the user's requested workflow.

## Canvas Map Example

Create a frame, then place notes inside its bounds using explicit positions. Frames are visual containers; MCP does not expose a parent-child grouping operation.

```json
{
  "projectId": "PROJECT_ID",
  "blockType": "frame",
  "position": { "x": 100, "y": 100 },
  "width": 900,
  "height": 600,
  "content": "Release plan"
}
```

Call `create_block` with those arguments. Then create related notes in one batch:

```json
{
  "projectId": "PROJECT_ID",
  "blocks": [
    {
      "blockType": "text",
      "content": "Define the release scope",
      "position": { "x": 150, "y": 180 }
    },
    {
      "blockType": "text",
      "content": "Validate the deployment",
      "position": { "x": 500, "y": 180 }
    }
  ]
}
```

Call `create_blocks_batch`, retain the returned IDs, and connect the notes with `create_link`:

```json
{
  "projectId": "PROJECT_ID",
  "sourceBlockId": "FIRST_BLOCK_ID",
  "targetBlockId": "SECOND_BLOCK_ID",
  "label": "followed by"
}
```

## Kanban Example

Create a kanban block, initialize its columns with `update_block`, then add tasks with `create_kanban_task`.

```json
{
  "projectId": "PROJECT_ID",
  "blockType": "kanban",
  "position": { "x": 1100, "y": 100 },
  "content": "Release tasks"
}
```

Use the returned block ID for `update_block`:

```json
{
  "projectId": "PROJECT_ID",
  "blockId": "KANBAN_BLOCK_ID",
  "metadata": {
    "columns": [
      {
        "id": "c-todo",
        "title": "To do",
        "workflowState": "todo",
        "tasks": []
      },
      {
        "id": "c-progress",
        "title": "In progress",
        "workflowState": "in-progress",
        "tasks": []
      },
      { "id": "c-done", "title": "Done", "workflowState": "done", "tasks": [] }
    ]
  }
}
```

Then call `create_kanban_task` with the kanban block ID, a column ID, and a title:

```json
{
  "projectId": "PROJECT_ID",
  "blockId": "KANBAN_BLOCK_ID",
  "columnId": "c-todo",
  "title": "Review the release checklist"
}
```

## Diagram Blocks

Do not assume Mermaid or PlantUML block types are available. Check the deployed server's `canvas://help` resource and the `create_block` input schema first. Once a diagram type is listed, use that exact block type and follow its documented content or metadata format; otherwise, represent the diagram with supported text blocks and links.
