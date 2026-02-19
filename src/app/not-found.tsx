import { Metadata } from "next";
import { cookies } from "next/headers";
import { loadDictionaries } from "./i18n/loader";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const lang = cookieStore.get("ideonLang")?.value || "en";
  const dictionaries = await loadDictionaries();
  const dict = dictionaries[lang] || dictionaries["en"];

  return {
    title: dict.pages.notFound,
  };
}

export default async function NotFound() {
  const cookieStore = await cookies();
  const lang = cookieStore.get("ideonLang")?.value || "en";
  const dictionaries = await loadDictionaries();
  const dict = dictionaries[lang] || dictionaries["en"];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-page text-foreground">
      <h1 className="text-4xl font-bold mb-4">404</h1>
      <p className="text-xl mb-8">{dict.pages.notFound}</p>
      <Link href="/home" className="btn-primary">
        {dict.pages.home}
      </Link>
    </div>
  );
}
