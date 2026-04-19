import { getDb } from "@lib/db";
import { authenticatedAction } from "@lib/server-utils";
import { getProjectsQuery } from "@lib/queries";

export interface DashboardProject {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
  ownerId: string;
  role: string;
  isStarred: number;
  collaboratorCount: number;
}

export interface DashboardStats {
  myProjects: number;
  starred: number;
  shared: number;
  trash: number;
}

export interface DashboardResponse {
  stats: DashboardStats;
  recent: DashboardProject[];
  starred: DashboardProject[];
}

export const GET = authenticatedAction(
  async (_req, { user }) => {
    if (!user) throw new Error("Unauthorized");
    const db = getDb();

    const [myCount, starredCount, sharedCount, trashCount, recent, starred] =
      await Promise.all([
        db
          .selectFrom(
            getProjectsQuery(db, user.id, "my-projects", null, undefined).as(
              "p",
            ),
          )
          .select((eb) => eb.fn.countAll<number>().as("count"))
          .executeTakeFirst(),
        db
          .selectFrom(
            getProjectsQuery(db, user.id, "starred", null, undefined).as("p"),
          )
          .select((eb) => eb.fn.countAll<number>().as("count"))
          .executeTakeFirst(),
        db
          .selectFrom(
            getProjectsQuery(db, user.id, "shared", null, undefined).as("p"),
          )
          .select((eb) => eb.fn.countAll<number>().as("count"))
          .executeTakeFirst(),
        db
          .selectFrom(
            getProjectsQuery(db, user.id, "trash", null, undefined).as("p"),
          )
          .select((eb) => eb.fn.countAll<number>().as("count"))
          .executeTakeFirst(),
        getProjectsQuery(db, user.id, "all", null, undefined)
          .limit(5)
          .execute(),
        getProjectsQuery(db, user.id, "starred", null, undefined)
          .limit(4)
          .execute(),
      ]);

    const response: DashboardResponse = {
      stats: {
        myProjects: Number(myCount?.count ?? 0),
        starred: Number(starredCount?.count ?? 0),
        shared: Number(sharedCount?.count ?? 0),
        trash: Number(trashCount?.count ?? 0),
      },
      recent: recent as unknown as DashboardProject[],
      starred: starred as unknown as DashboardProject[],
    };

    return response;
  },
  { requireUser: true },
);
