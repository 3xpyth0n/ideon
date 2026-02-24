import { Metadata } from "next";
import { cookies } from "next/headers";
import { loadDictionaries } from "@i18n/loader";
import { getDb, withAuthenticatedSession } from "@lib/db";
import { getProjectsQuery } from "@lib/queries";
import ProjectClient from "./ProjectClient";
import { getAuthUser } from "@auth";
import { RequestAccessModal } from "@components/project/RequestAccessModal";
import { redirect, notFound } from "next/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const cookieStore = await cookies();
  const lang = cookieStore.get("ideonLang")?.value || "en";
  const dictionaries = await loadDictionaries();
  const dict = dictionaries[lang] || dictionaries["en"];

  if (id && id !== "undefined") {
    const user = await getAuthUser();
    if (user) {
      const project = await withAuthenticatedSession(user.id, async (tx) => {
        return tx
          .selectFrom("projects")
          .select("name")
          .where("id", "=", id)
          .executeTakeFirst();
      });

      if (project) {
        return {
          title: project.name,
        };
      }
    }
  }

  return {
    title: dict.pages.project,
  };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getAuthUser();

  if (!user) {
    redirect(`/login?callbackUrl=/project/${id}`);
  }

  const db = getDb();

  // Check access using centralized query logic, inside an authenticated session
  // so PostgreSQL RLS policies have the current user ID set correctly.
  const projectWithAccess = await withAuthenticatedSession(
    user.id,
    async (tx) => {
      return getProjectsQuery(tx, user.id, null, null, [id]).executeTakeFirst();
    },
  );

  if (!projectWithAccess) {
    // Check if project exists at all. This query runs outside RLS scope intentionally:
    // getProjectsQuery already enforces access control at the application level,
    // so we only need an existence check here — not an access check.
    // We use a raw pool query to bypass FORCE ROW LEVEL SECURITY on the projects table.
    let project;
    try {
      const pool = (await import("@lib/db")).getPool();
      if (pool) {
        const result = await pool.query<{ name: string }>(
          'SELECT name FROM projects WHERE id = $1',
          [id],
        );
        project = result.rows[0] ?? null;
      } else {
        // SQLite fallback (no RLS)
        project = await db
          .selectFrom("projects")
          .select("name")
          .where("id", "=", id)
          .executeTakeFirst();
      }
    } catch (error) {
      console.error("Failed to fetch project details:", error);
      project = null;
    }

    if (!project) {
      notFound();
    }

    // Check for pending request, inside an authenticated session for RLS
    let request;
    try {
      request = await withAuthenticatedSession(user.id, async (tx) => {
        return tx
          .selectFrom("projectRequests")
          .select("status")
          .where("projectId", "=", id)
          .where("userId", "=", user.id)
          .executeTakeFirst();
      });
    } catch (error) {
      console.error("Failed to fetch project request:", error);
      request = null;
    }

    return (
      <RequestAccessModal
        projectId={id}
        projectName={project.name}
        initialStatus={
          (request?.status as "pending" | "rejected" | null) ?? null
        }
      />
    );
  }

  return <ProjectClient id={id} />;
}
