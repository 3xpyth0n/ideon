import "server-only";
import fs from "fs/promises";
import path from "path";
import en from "./en.json";

export async function loadDictionaries() {
  const i18nDir = path.join(process.cwd(), "src/app/i18n");
  const files = await fs.readdir(i18nDir);
  const dictionaries: Record<string, typeof en> = {};

  for (const file of files) {
    if (file.endsWith(".json")) {
      const lang = path.basename(file, ".json");
      const content = await fs.readFile(path.join(i18nDir, file), "utf-8");
      try {
        dictionaries[lang] = JSON.parse(content);
      } catch (e) {
        console.error(`Failed to parse i18n file: ${file}`, e);
      }
    }
  }

  return dictionaries;
}
