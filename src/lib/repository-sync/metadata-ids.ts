export function remapMetadataBlockIds(
  blockType: string,
  value: unknown,
  idMap: ReadonlyMap<string, string>,
): unknown {
  const wasString = typeof value === "string";
  let parsed: unknown = value;
  if (wasString) {
    try {
      parsed = JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return value;
  }

  const metadata = JSON.parse(JSON.stringify(parsed)) as Record<
    string,
    unknown
  >;
  if (blockType === "frame" && Array.isArray(metadata.childBlockIds)) {
    metadata.childBlockIds = metadata.childBlockIds.map((id) =>
      typeof id === "string" ? idMap.get(id) ?? id : id,
    );
  }
  if (blockType === "kanban" && Array.isArray(metadata.columns)) {
    for (const column of metadata.columns) {
      if (!column || typeof column !== "object" || Array.isArray(column)) {
        continue;
      }
      const tasks = (column as Record<string, unknown>).tasks;
      if (!Array.isArray(tasks)) continue;
      for (const task of tasks) {
        if (!task || typeof task !== "object" || Array.isArray(task)) continue;
        const linkedTasks = (task as Record<string, unknown>).linkedTasks;
        if (!Array.isArray(linkedTasks)) continue;
        for (const linkedTask of linkedTasks) {
          if (
            !linkedTask ||
            typeof linkedTask !== "object" ||
            Array.isArray(linkedTask)
          ) {
            continue;
          }
          const reference = linkedTask as Record<string, unknown>;
          if (typeof reference.blockId === "string") {
            reference.blockId =
              idMap.get(reference.blockId) ?? reference.blockId;
          }
        }
      }
    }
  }

  if (blockType === "database" && Array.isArray(metadata.rows)) {
    for (const row of metadata.rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const cells = (row as Record<string, unknown>).cells;
      if (!cells || typeof cells !== "object" || Array.isArray(cells)) continue;
      for (const colId of Object.keys(cells)) {
        const cell = (cells as Record<string, unknown>)[colId];
        if (!cell || typeof cell !== "object" || Array.isArray(cell)) continue;
        const relation = cell as Record<string, unknown>;
        if (typeof relation.blockId === "string") {
          relation.blockId = idMap.get(relation.blockId) ?? relation.blockId;
        }
      }
    }
  }

  return wasString ? JSON.stringify(metadata) : metadata;
}
