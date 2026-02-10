import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAuthUser, AuthUser } from "@auth";
import { getDb, withAuthenticatedSession } from "./db";
import { Selectable } from "kysely";
import { projectsTable } from "./types/db";
import { z } from "zod";

type ApiHandler<T, B = unknown> = (
  req: NextRequest,
  context: { params: Record<string, string>; user: AuthUser | null; body: B },
) => Promise<NextResponse<T> | T | void>;

type ProjectApiHandler<T, B = unknown> = (
  req: NextRequest,
  context: {
    params: Record<string, string>;
    user: AuthUser;
    project: Selectable<projectsTable>;
    body: B;
  },
) => Promise<NextResponse<T> | T | void>;

interface ActionOptions<B> {
  schema?: z.ZodSchema<B>;
  requiredRole?: AuthUser["role"];
  requireUser?: boolean;
}

export function authenticatedAction<T, B = unknown>(
  handler: ApiHandler<T, B>,
  options?: ActionOptions<B>,
) {
  return async (
    req: NextRequest,
    { params }: { params: Promise<Record<string, string>> },
  ) => {
    try {
      // Await params as they can be a Promise in Next.js 15+
      const resolvedParams = await params;

      const user = await getAuthUser();

      if (!user && options?.requireUser !== false) {
        throw { status: 401, message: "Unauthorized" };
      }

      if (options?.requireUser && !user) {
        throw { status: 401, message: "Unauthorized: User required" };
      }

      if (options?.requiredRole && user) {
        const roleHierarchy: Record<AuthUser["role"], number> = {
          superadmin: 3,
          admin: 2,
          member: 1,
        };
        const userLevel = roleHierarchy[user.role] || 0;
        const requiredLevel = roleHierarchy[options.requiredRole] || 0;

        if (userLevel < requiredLevel) {
          throw { status: 403, message: "Forbidden" };
        }
      }

      // Update lastOnline for authenticated users
      if (user) {
        const db = getDb();
        db.updateTable("users")
          .set({ lastOnline: new Date().toISOString() })
          .where("id", "=", user.id)
          .execute()
          .catch((err) => console.error("[lastOnline update error]:", err));
      }

      let body = {} as B;
      const contentType = req.headers.get("content-type") || "";

      if (
        (req.method === "POST" ||
          req.method === "PUT" ||
          req.method === "PATCH") &&
        contentType.includes("application/json")
      ) {
        const rawBody = await req.json().catch(() => ({}));
        if (options?.schema) {
          body = options.schema.parse(rawBody);
        } else {
          body = rawBody;
        }
      }

      const executeHandler = () =>
        handler(req, {
          params: resolvedParams,
          user: user || null,
          body,
        });

      let result;
      if (user) {
        // Wrap execution in an authenticated session to enable RLS (Postgres)
        result = await withAuthenticatedSession(user.id, () =>
          executeHandler(),
        );
      } else {
        result = await executeHandler();
      }

      if (
        result &&
        typeof result === "object" &&
        (result instanceof Response ||
          result instanceof NextResponse ||
          "status" in result)
      ) {
        return result as NextResponse;
      }

      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            error: error.errors[0]?.message || "Invalid request body",
            details: error.errors,
          },
          { status: 400 },
        );
      }

      const status = (error as { status?: number })?.status || 500;
      const isExplicitError =
        typeof (error as { status?: number })?.status === "number";

      let message =
        (error as { message?: string })?.message ||
        (status === 500 ? "Internal Server Error" : "Error");

      if (status === 500 && !isExplicitError) {
        console.error("[API Error]:", error);
        message = "Internal Server Error";
      }

      return NextResponse.json({ error: message }, { status });
    }
  };
}

export function adminAction<T, B = unknown>(
  handler: ApiHandler<T, B>,
  options?: ActionOptions<B>,
) {
  return authenticatedAction(handler, { ...options, requiredRole: "admin" });
}

export function superAdminAction<T, B = unknown>(
  handler: ApiHandler<T, B>,
  options?: ActionOptions<B>,
) {
  return authenticatedAction(handler, {
    ...options,
    requiredRole: "superadmin",
  });
}

export function projectAction<T, B = unknown>(
  handler: ProjectApiHandler<T, B>,
  options?: ActionOptions<B>,
) {
  return authenticatedAction(async (req, { params, user, body }) => {
    if (!user) {
      throw { status: 401, message: "Unauthorized" };
    }

    const { id } = z.object({ id: z.string().uuid() }).parse(params);
    const db = getDb();

    const project = await db
      .selectFrom("projects")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!project) {
      throw { status: 404, message: "Project not found" };
    }

    // Verify ownership or collaboration
    if (project.ownerId !== user.id) {
      const collaborator = await db
        .selectFrom("projectCollaborators")
        .select("role")
        .where("projectId", "=", id)
        .where("userId", "=", user.id)
        .executeTakeFirst();

      if (!collaborator) {
        // Check folder inheritance
        let hasFolderAccess = false;

        if (project.folderId) {
          const folderAccess = await db
            .selectFrom("folders")
            .select("id")
            .where("id", "=", project.folderId)
            .where((eb) =>
              eb.or([
                eb("ownerId", "=", user.id),
                eb(
                  "id",
                  "in",
                  eb
                    .selectFrom("folderCollaborators")
                    .select("folderId")
                    .where("userId", "=", user.id),
                ),
              ]),
            )
            .executeTakeFirst();

          if (folderAccess) hasFolderAccess = true;
        }

        if (!hasFolderAccess) {
          throw { status: 403, message: "Forbidden" };
        }
      }
    }

    return handler(req, { params, user, project, body });
  }, options);
}
