import { describe, expect, it } from "vitest";
import { getSnippetLanguageOptions } from "./SnippetBlock";

describe("SnippetBlock language support", () => {
  it("includes SQL in the available snippet languages", () => {
    const options = getSnippetLanguageOptions({
      blocks: {
        languageJavascript: "JavaScript",
        languageTypescript: "TypeScript",
        languageCss: "CSS",
        languagePython: "Python",
        languageJson: "JSON",
        languagePlainText: "Plain Text",
        languageSql: "SQL",
      },
    } as never);

    expect(options.some((option) => option.value === "sql")).toBe(true);
    expect(options.find((option) => option.value === "sql")?.label).toBe("SQL");
  });
});
