import { Metadata } from "next";
import { cookies } from "next/headers";
import { loadDictionaries } from "@i18n/loader";
import AccountClient from "./AccountClient";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const lang = cookieStore.get("ideonLang")?.value || "en";
  const dictionaries = await loadDictionaries();
  const dict = dictionaries[lang] || dictionaries["en"];

  return {
    title: dict.pages.account,
  };
}

export default function AccountPage() {
  return <AccountClient />;
}
