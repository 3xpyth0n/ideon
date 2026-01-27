import { initJackson } from "@lib/jackson";
import { adminAction } from "@lib/server-utils";

export const dynamic = "force-dynamic";

export const GET = adminAction(
  async (_req, { user }) => {
    if (!user) throw new Error("Unauthorized");

    const jackson = await initJackson();
    const connections = await jackson.apiController.getConnections({
      tenant: "default",
      product: "ideon",
    });

    return { connection: connections[0] || null };
  },
  { requireUser: true },
);

export const POST = adminAction(
  async (_req, { body, user }) => {
    if (!user) throw new Error("Unauthorized");

    const { metadataUrl, metadataXml } = body as {
      metadataUrl?: string;
      metadataXml?: string;
    };

    const jackson = await initJackson();

    const connections = await jackson.apiController.getConnections({
      tenant: "default",
      product: "ideon",
    });

    if (connections.length > 0) {
      await jackson.apiController.deleteConnections({
        tenant: "default",
        product: "ideon",
      });
    }

    if (metadataXml) {
      await jackson.apiController.createSAMLConnection({
        tenant: "default",
        product: "ideon",
        defaultRedirectUrl: process.env.APP_URL || "http://localhost:3000",
        redirectUrl: process.env.APP_URL || "http://localhost:3000",
        rawMetadata: metadataXml,
      });
    } else if (metadataUrl) {
      await jackson.apiController.createSAMLConnection({
        tenant: "default",
        product: "ideon",
        defaultRedirectUrl: process.env.APP_URL || "http://localhost:3000",
        redirectUrl: process.env.APP_URL || "http://localhost:3000",
        metadataUrl,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    } else {
      throw new Error("Missing metadata");
    }

    return { success: true };
  },
  { requireUser: true },
);

export const DELETE = adminAction(
  async (_req, { user }) => {
    if (!user) throw new Error("Unauthorized");
    const jackson = await initJackson();
    await jackson.apiController.deleteConnections({
      tenant: "default",
      product: "ideon",
    });
    return { success: true };
  },
  { requireUser: true },
);
