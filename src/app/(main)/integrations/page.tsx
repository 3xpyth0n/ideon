import { getAuthUser } from "@auth";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { cookies } from "next/headers";
import { loadDictionaries } from "@i18n/loader";
import IntegrationsClient from "./IntegrationsClient";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const lang = cookieStore.get("ideonLang")?.value || "en";
  const dictionaries = await loadDictionaries();
  const dict = dictionaries[lang] || dictionaries["en"];

  return {
    title: dict.integrations.title,
  };
}

export default async function IntegrationsPage() {
  const auth = await getAuthUser();

  if (!auth) {
    redirect("/login");
  }

  return (
    <div className="island-content">
      <div className="zen-container">
        <IntegrationsClient />
      </div>
    </div>
  );
}
