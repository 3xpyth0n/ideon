import { ProjectList } from "@components/dashboard/ProjectList";
import { Metadata } from "next";
import { cookies } from "next/headers";
import { loadDictionaries } from "../../i18n/loader";
import { getDb } from "../../lib/db";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; folderId?: string }>;
}): Promise<Metadata> {
  const { folderId } = await searchParams;
  const cookieStore = await cookies();
  const lang = cookieStore.get("ideonLang")?.value || "en";
  const dictionaries = await loadDictionaries();
  const dict = dictionaries[lang] || dictionaries["en"];

  if (folderId) {
    const db = getDb();
    const folder = await db
      .selectFrom("folders")
      .select("name")
      .where("id", "=", folderId)
      .executeTakeFirst();

    if (folder) {
      return {
        title: folder.name,
      };
    }
  }

  return {
    title: dict.pages.home,
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; folderId?: string }>;
}) {
  const { view, folderId } = await searchParams;
  return (
    <div className="island-content">
      <ProjectList
        key={`${view || "all"}-${folderId || "root"}`}
        view={view}
        folderId={folderId}
      />
    </div>
  );
}
