import { authenticateApiKey } from "../mcp/auth";
import { checkProjectAccess } from "../mcp/tools/projects";

export async function authorizeWebhookApiKey(
  authHeader: string | undefined,
  projectId: string,
): Promise<boolean> {
  const auth = await authenticateApiKey(authHeader);
  if (!auth) return false;
  try {
    await checkProjectAccess(auth.userId, projectId, "editor");
    return true;
  } catch {
    return false;
  }
}
