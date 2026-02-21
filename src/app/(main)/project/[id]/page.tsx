import { Metadata } from "next";
import { cookies } from "next/headers";
import { loadDictionaries } from "@i18n/loader";
import { getDb } from "@lib/db";
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
    const db = getDb();
    const project = await db
      .selectFrom("projects")
      .select("name")
      .where("id", "=", id)
      .executeTakeFirst();

    if (project) {
      return {
        title: project.name,
      };
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

  // Check access using centralized query logic
  const projectWithAccess = await getProjectsQuery(db, user.id, null, null, [
    id,
  ]).executeTakeFirst();

  if (!projectWithAccess) {
    // Check if project exists at all
    let project;
    try {
      project = await db
        .selectFrom("projects")
        .select("name")
        .where("id", "=", id)
        .executeTakeFirst();
    } catch (error) {
      console.error("Failed to fetch project details:", error);
      project = null;
    }

    if (!project) {
      notFound();
    }

    // Check for pending request
    let request;
    try {
      request = await db
        .selectFrom("projectRequests")
        .select("status")
        .where("projectId", "=", id)
        .where("userId", "=", user.id)
        .executeTakeFirst();
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
