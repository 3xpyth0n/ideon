import { initJackson } from "@lib/jackson";
import { adminAction } from "@lib/server-utils";

export const dynamic = "force-dynamic";

export const GET = adminAction(
  async (_req, { user }) => {
    if (!user) throw new Error("Unauthorized");

    const jackson = await initJackson();
    // Jackson might throw if no connection found? No, returns empty array.
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

    // If updating, we can just overwrite.
    // Jackson doesn't have a simple "upsert" for connection with same tenant/product if we don't know the clientID?
    // Actually getConnections returns the current one.
    const connections = await jackson.apiController.getConnections({
      tenant: "default",
      product: "ideon",
    });

    if (connections.length > 0) {
      // Update existing
      // updateSAMLConnection expects clientID or tenant+product?
      // It expects clientID and clientSecret usually, or we can use delete/create pattern to be sure.
      await jackson.apiController.deleteConnections({
        tenant: "default",
        product: "ideon",
      });
    }

    // Create new
    // @ts-expect-error - We might only have metadataUrl which Jackson supports but types require rawMetadata
    await jackson.apiController.createSAMLConnection({
      tenant: "default",
      product: "ideon",
      defaultRedirectUrl: process.env.APP_URL || "http://localhost:3000",
      redirectUrl: process.env.APP_URL || "http://localhost:3000",
      rawMetadata: metadataXml,
      metadataUrl: metadataUrl,
    });

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
