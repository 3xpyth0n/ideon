/**
 * Project tools for the MCP server.
 *
 * Provides `list_projects` and `get_project` tools, plus the shared
 * `checkProjectAccess` helper used by all tool files to verify that the
 * authenticated user has permission to access/modify a project.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LeveldbPersistence } from "y-leveldb";
import { getGlobalDb } from "../../../app/lib/db";
import { getMcpContext } from "../context";
import { getProjectDoc, readBlocks, readLinks } from "../yjs-bridge";
import { computeBoundingBox } from "../placement-engine";
import { NotFoundError, PermissionError } from "../errors";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ProjectRole = "owner" | "editor" | "viewer";

// ─── Role Hierarchy ──────────────────────────────────────────────────────────

const ROLE_HIERARCHY: Record<ProjectRole, number> = {
  owner: 3,
  editor: 2,
  viewer: 1,
};

// ─── Access Check Helper ─────────────────────────────────────────────────────

/**
 * Verifies that a user has access to a project, optionally requiring a minimum role.
 *
 * Checks project ownership (projects.ownerId) first, then falls back to
 * a lookup in projectCollaborators. If `requiredRole` is specified, verifies
 * the user's effective role meets or exceeds it in the hierarchy (owner > editor > viewer).
 *
 * @returns The user's effective role ("owner" | "editor" | "viewer")
 * @throws NotFoundError if the project doesn't exist or user has no access
 * @throws PermissionError if the user's role is insufficient
 */
export async function checkProjectAccess(
  userId: string,
  projectId: string,
  requiredRole: ProjectRole = "viewer",
): Promise<ProjectRole> {
  const db = getGlobalDb();

  const project = await db
    .selectFrom("projects")
    .select(["id", "ownerId"])
    .where("id", "=", projectId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();

  if (!project) {
    throw new NotFoundError("Project not found");
  }

  // Owner always has full access
  if (project.ownerId === userId) {
    return "owner";
  }

  // Check collaboration entry
  const collaborator = await db
    .selectFrom("projectCollaborators")
    .select("role")
    .where("projectId", "=", projectId)
    .where("userId", "=", userId)
    .executeTakeFirst();

  if (!collaborator) {
    // No access — return "not found" to avoid leaking project existence
    throw new NotFoundError("Project not found");
  }

  const userRole = collaborator.role as ProjectRole;

  // Verify role hierarchy if a required role is specified
  const userLevel = ROLE_HIERARCHY[userRole] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 0;

  if (userLevel < requiredLevel) {
    throw new PermissionError(
      `Insufficient permissions: requires ${requiredRole}, has ${userRole}`,
    );
  }

  return userRole;
}

// ─── Tool Registration ───────────────────────────────────────────────────────

export function registerProjectTools(
  server: McpServer,
  ldb: LeveldbPersistence,
): void {
  // ── list_projects ──────────────────────────────────────────────────────────

  server.tool(
    "list_projects",
    "List all projects accessible by the authenticated user (owned or collaborated on). Returns up to 100 projects with basic metadata including block count.",
    {},
    async () => {
      const { userId } = getMcpContext();
      const db = getGlobalDb();

      const projects = await db
        .selectFrom("projects")
        .select(["projects.id", "projects.name", "projects.description"])
        .where("deletedAt", "is", null)
        .where((eb) =>
          eb.or([
            eb("projects.ownerId", "=", userId),
            eb(
              "projects.id",
              "in",
              eb
                .selectFrom("projectCollaborators")
                .select("projectId")
                .where("userId", "=", userId),
            ),
          ]),
        )
        .orderBy("projects.updatedAt", "desc")
        .limit(100)
        .execute();

      // Load block counts from Yjs docs
      const projectsWithCounts = await Promise.all(
        projects.map(async (project) => {
          let blockCount = 0;
          try {
            const { ydoc } = await getProjectDoc(project.id, ldb);
            blockCount = readBlocks(ydoc).length;
          } catch {
            // If Yjs doc can't be loaded, return 0
          }
          return {
            id: project.id,
            name: project.name,
            description: project.description ?? "",
            blockCount,
          };
        }),
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ projects: projectsWithCounts }, null, 2),
          },
        ],
      };
    },
  );

  // ── get_project ────────────────────────────────────────────────────────────

  server.tool(
    "get_project",
    "Get detailed information about a specific project including block count, link count, and canvas bounding box. Requires at least viewer access.",
    {
      projectId: z.string().describe("The unique identifier of the project"),
    },
    async ({ projectId }) => {
      const { userId } = getMcpContext();

      // Validate access (any role is fine for reading)
      await checkProjectAccess(userId, projectId);

      const db = getGlobalDb();
      const project = await db
        .selectFrom("projects")
        .select(["id", "name", "description"])
        .where("id", "=", projectId)
        .executeTakeFirst();

      if (!project) {
        throw new NotFoundError("Project not found");
      }

      // Load Yjs doc for block/link/bbox data
      const { ydoc } = await getProjectDoc(projectId, ldb);
      const blocks = readBlocks(ydoc);
      const links = readLinks(ydoc);

      // Compute bounding box (null if no blocks)
      let boundingBox: {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
      } | null = null;

      if (blocks.length > 0) {
        const existingBlocks = blocks.map((b) => ({
          x: b.position.x,
          y: b.position.y,
          width: b.width ?? 320,
          height: b.height ?? 240,
        }));
        const bbox = computeBoundingBox(existingBlocks);
        boundingBox = {
          minX: bbox.minX,
          minY: bbox.minY,
          maxX: bbox.maxX,
          maxY: bbox.maxY,
        };
      }

      const result = {
        id: project.id,
        name: project.name,
        description: project.description ?? "",
        blockCount: blocks.length,
        linkCount: links.length,
        boundingBox,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );
}
