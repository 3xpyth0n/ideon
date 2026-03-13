import { authenticatedAction } from "@lib/server-utils";
import { z } from "zod";
import { getDb } from "@lib/db";
import {
  getImportCapability,
  getIntegrationReleaseStatus,
} from "@lib/integrations";
import {
  getIntegration,
  getIntegrationImporter,
} from "@lib/integrations/server";
import { IntegrationImportInput } from "@lib/integrations/import/types";

const sourceSchema = z.enum(["zip", "directoryPath"]);
const MAX_IMPORT_ARCHIVE_SIZE_BYTES = 200 * 1024 * 1024;

export const POST = authenticatedAction(
  async (req, { user, params }) => {
    if (!user) {
      throw { status: 401, message: "Unauthorized" };
    }

    const id = z.string().min(1).parse(params.id);
    const integration = getIntegration(id);

    if (!integration) {
      throw { status: 404, message: "Integration not found" };
    }

    const releaseStatus = getIntegrationReleaseStatus(integration);
    if (releaseStatus === "coming_soon") {
      throw {
        status: 409,
        message: "Integration is not released yet",
      };
    }

    const importCapability = getImportCapability(integration);
    if (!importCapability) {
      throw {
        status: 400,
        message: "Import is not enabled for this integration",
      };
    }

    const importer = getIntegrationImporter(id);
    if (!importer) {
      throw {
        status: 500,
        message: "Integration importer is not registered",
      };
    }

    const formData = await req.formData();
    const source = sourceSchema.parse(formData.get("source"));

    if (!importCapability.sources.includes(source)) {
      throw { status: 400, message: "Import source is not supported" };
    }

    const projectName = (formData.get("projectName") as string | null) || "";

    const input: IntegrationImportInput = {
      source,
      projectName,
    };

    if (source === "zip") {
      const file = formData.get("file") as File | null;
      if (!file) {
        throw { status: 400, message: "Missing archive file" };
      }

      if (!file.name.toLowerCase().endsWith(".zip")) {
        throw { status: 400, message: "Only .zip archives are supported" };
      }

      if (file.size > MAX_IMPORT_ARCHIVE_SIZE_BYTES) {
        throw {
          status: 413,
          message: "Archive is too large (max 200MB)",
        };
      }

      const bytes = await file.arrayBuffer();
      input.zipBuffer = Buffer.from(bytes);
    }

    if (source === "directoryPath") {
      const directoryPath =
        (formData.get("directoryPath") as string | null)?.trim() || "";

      if (!directoryPath) {
        throw { status: 400, message: "Missing directory path" };
      }

      input.directoryPath = directoryPath;
    }

    const result = await importer.executeImport({
      db: getDb(),
      user,
      input,
    });

    return result;
  },
  { requireUser: true },
);
