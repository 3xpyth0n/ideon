import { Metadata } from "next";
import { cookies } from "next/headers";
import { loadDictionaries } from "../i18n/loader";
import { SetupForm } from "./SetupForm";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const lang = cookieStore.get("ideonLang")?.value || "en";
  const dictionaries = await loadDictionaries();
  const dict = dictionaries[lang] || dictionaries["en"];

  return {
    title: dict.pages.setup,
  };
}

export default function SetupPage() {
  return <SetupForm />;
}
