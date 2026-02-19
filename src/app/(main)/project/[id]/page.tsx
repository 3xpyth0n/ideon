import { Metadata } from "next";
import { cookies } from "next/headers";
import { loadDictionaries } from "../../../i18n/loader";
import { getDb } from "../../../lib/db";
import ProjectClient from "./ProjectClient";

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
  return <ProjectClient id={id} />;
}
