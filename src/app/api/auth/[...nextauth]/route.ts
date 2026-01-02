import { handlers } from "@auth";
import { NextRequest } from "next/server";

const { GET: authGET, POST: authPOST } = handlers;

export async function POST(req: NextRequest) {
  const res = await authPOST(req);
  if (req.nextUrl.pathname.includes("/callback/credentials")) {
    const clonedRes = res.clone();
    try {
      const body = await clonedRes.json();
      if (body?.error || body?.url?.includes("error=")) {
        return new Response(res.body, {
          status: 401,
          headers: res.headers,
        });
      }
    } catch {
      // Proceed if response body is not valid JSON
    }
  }

  return res;
}

export { authGET as GET };
