import { getDb } from "@lib/db";
import { authenticatedAction } from "@lib/server-utils";
import { getProjectAccessCondition } from "@lib/queries";
import { sql } from "kysely";

export interface HomeSearchItem {
  id: string;
  type: "project" | "folder";
  name: string;
  description: string | null;
  updatedAt: string;
  target: string;
}

export interface HomeSearchResponse {
  projects: HomeSearchItem[];
  folders: HomeSearchItem[];
}

export const GET = authenticatedAction<HomeSearchResponse>(
  async (req, { user }) => {
    if (!user) throw new Error("Unauthorized");

    const term = new URL(req.url).searchParams.get("q")?.trim() || "";
    if (term.length < 2) {
      return { projects: [], folders: [] } satisfies HomeSearchResponse;
    }

    const db = getDb();
    const pattern = `%${term.toLowerCase()}%`;

    const [projects, folders] = await Promise.all([
      db
        .selectFrom("projects")
        .select([
          "projects.id",
          "projects.name",
          "projects.description",
          "projects.updatedAt",
          "projects.folderId",
        ])
        .where((eb) => getProjectAccessCondition(eb, user.id))
        .where("projects.deletedAt", "is", null)
        .where(
          sql<boolean>`(
            lower("projects"."name") like ${pattern}
            or lower(coalesce("projects"."description", '')) like ${pattern}
          )`,
        )
        .orderBy("projects.updatedAt", "desc")
        .limit(8)
        .execute(),
      db
        .selectFrom("folders")
        .select(["folders.id", "folders.name", "folders.updatedAt"])
        .where((eb) =>
          eb.or([
            eb("folders.ownerId", "=", user.id),
            eb(
              "folders.id",
              "in",
              eb
                .selectFrom("folderCollaborators")
                .select("folderId")
                .where("userId", "=", user.id),
            ),
          ]),
        )
        .where("folders.deletedAt", "is", null)
        .where(sql<boolean>`lower("folders"."name") like ${pattern}`)
        .orderBy("folders.updatedAt", "desc")
        .limit(6)
        .execute(),
    ]);

    return {
      projects: projects.map((project) => ({
        id: project.id,
        type: "project" as const,
        name: project.name,
        description: project.description,
        updatedAt: new Date(project.updatedAt).toISOString(),
        target: project.folderId
          ? `/project/${project.id}?folderId=${project.folderId}`
          : `/project/${project.id}`,
      })),
      folders: folders.map((folder) => ({
        id: folder.id,
        type: "folder" as const,
        name: folder.name,
        description: null,
        updatedAt: new Date(folder.updatedAt).toISOString(),
        target: `/home?folderId=${folder.id}`,
      })),
    } satisfies HomeSearchResponse;
  },
  {
    requireUser: true,
  },
);