import { getAuthUser } from "@auth";
import { getDb } from "@lib/db";
import { redirect } from "next/navigation";
import UsersClient from "./UsersClient";

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
