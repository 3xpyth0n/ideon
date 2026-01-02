import { NextRequest } from "next/server";
import { signIn } from "@auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const authProvider = provider === "entra" ? "azure-ad" : provider;

  return await signIn(authProvider, {
    redirectTo: "/home",
    redirect: true,
  });
}
