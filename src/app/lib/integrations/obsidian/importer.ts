import {
  IntegrationImporter,
  IntegrationImportResult,
} from "@lib/integrations/import/types";
import { persistNormalizedImport } from "@lib/integrations/import/service";
import { parseObsidianDirectory, parseObsidianZip } from "./parser";

export const obsidianImporter: IntegrationImporter = {
  executeImport: async ({
    db,
    user,
    input,
  }): Promise<IntegrationImportResult> => {
    const normalizedData =
      input.source === "directoryPath"
        ? await parseObsidianDirectory(input.directoryPath || "")
        : parseObsidianZip(input.zipBuffer || Buffer.alloc(0));

    if (!normalizedData.notes.length && !normalizedData.assets.length) {
      throw {
        status: 400,
        message: "No importable files were found in the Obsidian source",
      };
    }

    const result: IntegrationImportResult = await persistNormalizedImport({
      db,
      userId: user.id,
      projectName:
        input.projectName?.trim() ||
        normalizedData.suggestedProjectName ||
        "Obsidian Import",
      description: "Imported from Obsidian",
      data: normalizedData,
    });

    return result;
  },
};
