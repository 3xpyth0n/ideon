import { redirect } from "next/navigation";

export default async function AuditPage() {
  redirect("/management#audit");
}
