import { getAuthUser } from "@auth";
import { getDb } from "@lib/db";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { cookies } from "next/headers";
import { loadDictionaries } from "../../i18n/loader";
import UsersClient from "./UsersClient";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const lang = cookieStore.get("ideonLang")?.value || "en";
  const dictionaries = await loadDictionaries();
  const dict = dictionaries[lang] || dictionaries["en"];

  return {
    title: dict.pages.users,
  };
}

export default async function UsersPage() {
  const auth = await getAuthUser();

  if (!auth) {
    redirect("/login");
  }

  // Fetch current role from DB to avoid stale JWT issues
  const db = getDb();
  const user = await db
    .selectFrom("users")
    .select("role")
    .where("id", "=", auth.id)
    .executeTakeFirst();

  if (!user || (user.role !== "superadmin" && user.role !== "admin")) {
    redirect("/");
  }

  return (
    <div className="island-content">
      <div className="zen-container">
        <UsersClient currentUserRole={user.role} />
      </div>
    </div>
  );
}
