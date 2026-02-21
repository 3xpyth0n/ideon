import { redirect } from "next/navigation";
import { Metadata } from "next";
import { cookies } from "next/headers";
import { loadDictionaries } from "@i18n/loader";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const lang = cookieStore.get("ideonLang")?.value || "en";
  const dictionaries = await loadDictionaries();
  const dict = dictionaries[lang] || dictionaries["en"];

  return {
    title: dict.pages.securityAudit,
  };
}

export default async function AuditPage() {
  redirect("/management#audit");
}
