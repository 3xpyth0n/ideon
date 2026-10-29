/* Unknown remap targets stay as-is (matches frame childBlockIds / relation.blockId for cross-batch imports). */
export function remapBlockId(
  idMap: ReadonlyMap<string, string>,
  id: string,
): string {
  return idMap.get(id) ?? id;
}

export function remapAFrameHotspotsFromParsed(
  parsed: unknown,
  idMap: ReadonlyMap<string, string>,
): unknown {
  if (!parsed || typeof parsed !== "object") return parsed;

  const hotspots = (parsed as { hotspots?: unknown }).hotspots;
  if (!Array.isArray(hotspots)) return parsed;

  for (const hotspot of hotspots) {
    if (hotspot && typeof hotspot === "object" && "blockId" in hotspot) {
      const hot = hotspot as Record<string, unknown>;
      if (typeof hot.blockId === "string") {
        hot.blockId = remapBlockId(idMap, hot.blockId);
      }
    }
  }
  return parsed;
}
