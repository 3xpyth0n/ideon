export type DragSession = {
  anchorId: string;
  initialPositions: ReadonlyMap<string, { x: number; y: number }>;
  memberIds: ReadonlySet<string>;
};

export function computeRigidGroupPositions(
  session: DragSession,
  anchorTarget: { x: number; y: number },
): Map<string, { x: number; y: number }> {
  const anchorInitial = session.initialPositions.get(session.anchorId);
  if (!anchorInitial) {
    throw new Error("Anchor initial position not found");
  }

  const dx = anchorTarget.x - anchorInitial.x;
  const dy = anchorTarget.y - anchorInitial.y;

  const result = new Map<string, { x: number; y: number }>();
  for (const [id, initialPos] of session.initialPositions.entries()) {
    result.set(id, { x: initialPos.x + dx, y: initialPos.y + dy });
  }
  return result;
}
