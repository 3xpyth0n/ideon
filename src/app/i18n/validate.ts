import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const i18nDir = __dirname;

// Discover all JSON translation files and sort them
const jsonFiles = fs
  .readdirSync(i18nDir)
  .filter((file) => file.endsWith(".json") && file !== "loader.ts")
  .sort();

if (jsonFiles.length < 2) {
  console.error("❌ At least 2 translation files required");
  process.exit(1);
}

console.log(
  `📝 Found ${jsonFiles.length} translation files: ${jsonFiles.join(", ")}\n`,
);

// Read and parse all files
const fileKeys: Record<string, unknown> = {};
for (const file of jsonFiles) {
  try {
    const content = fs.readFileSync(path.join(i18nDir, file), "utf8");
    fileKeys[file] = JSON.parse(content);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error(`❌ Failed to parse ${file}:`, errorMessage);
    process.exit(1);
  }
}

// Helper to flatten nested object keys
function flattenKeys(obj: unknown, prefix = ""): string[] {
  const keys: string[] = [];
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return keys;
  }

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? prefix + "." + key : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      keys.push(...flattenKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

// Get keys for all files
const allKeysByFile: Record<string, string[]> = {};
for (const file of jsonFiles) {
  allKeysByFile[file] = flattenKeys(fileKeys[file]);
}

// Use en.json as the reference file
if (!jsonFiles.includes("en.json")) {
  console.error("❌ en.json is required as the reference translation file");
  process.exit(1);
}

const referenceFile = "en.json";
const referenceKeys = allKeysByFile[referenceFile];

console.log(`📊 Key counts:`);
console.log(`  en.json: ${allKeysByFile["en.json"].length} keys`);
for (const file of jsonFiles) {
  if (file === "en.json") continue;
  console.log(`  ${file}: ${allKeysByFile[file].length} keys`);
}
console.log();

let failed = false;

// Check all files against en.json reference
for (const file of jsonFiles) {
  if (file === "en.json") continue;

  const currentKeys = allKeysByFile[file];

  if (currentKeys.length !== referenceKeys.length) {
    console.error(
      `❌ Key count mismatch: ${referenceFile} has ${referenceKeys.length} keys, ${file} has ${currentKeys.length}`,
    );
    failed = true;
  }

  // Check if keys are in the same order
  if (JSON.stringify(referenceKeys) !== JSON.stringify(currentKeys)) {
    console.error(
      `❌ Key order or set mismatch between ${referenceFile} and ${file}`,
    );

    const refSet = new Set(referenceKeys);
    const currentSet = new Set(currentKeys);

    const missingInCurrent = referenceKeys.filter((k) => !currentSet.has(k));
    const extraInCurrent = currentKeys.filter((k) => !refSet.has(k));

    if (missingInCurrent.length > 0) {
      console.error(`   Missing in ${file}: ${missingInCurrent.join(", ")}`);
    }
    if (extraInCurrent.length > 0) {
      console.error(`   Extra in ${file}: ${extraInCurrent.join(", ")}`);
    }

    failed = true;
  }
}

// Check for empty values across all files
function flattenValues(obj: unknown, prefix = ""): string[] {
  const values: string[] = [];
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return values;
  }

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? prefix + "." + key : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      values.push(...flattenValues(value, fullKey));
    } else if (value === "") {
      values.push(fullKey);
    }
  }
  return values;
}

let hasEmptyValues = false;
for (const file of jsonFiles) {
  const emptyValues = flattenValues(fileKeys[file]);
  if (emptyValues.length > 0) {
    console.warn(`⚠️  Empty values in ${file}: ${emptyValues.join(", ")}`);
    hasEmptyValues = true;
  }
}

if (failed) {
  console.error("\n❌ i18n synchronization check failed");
  process.exit(1);
} else if (hasEmptyValues) {
  console.log(
    "\n✅ i18n files are properly synchronized (with warnings about empty values)",
  );
} else {
  console.log(
    "\n✅ i18n files are properly synchronized and have no empty values",
  );
}

// LINE-BY-LINE VERIFICATION as final check
console.log("🔍 Performing line-by-line verification...");
const fileLines: Record<string, string[]> = {};
for (const file of jsonFiles) {
  const content = fs.readFileSync(path.join(i18nDir, file), "utf8");
  fileLines[file] = content.split("\n");
}

function extractKeyFromLine(line: string): string | null {
  const match = line.match(/"([^"]+)"\s*:/);
  return match ? match[1] : null;
}

let lineByLineCheckFailed = false;
const referenceLines = fileLines["en.json"];

for (let lineIdx = 0; lineIdx < referenceLines.length; lineIdx++) {
  const refKey = extractKeyFromLine(referenceLines[lineIdx]);
  if (!refKey) continue;

  for (const file of jsonFiles) {
    if (file === "en.json") continue;
    const currentLine = fileLines[file][lineIdx];
    const currentKey = extractKeyFromLine(currentLine);

    if (currentKey !== refKey) {
      console.error(
        `❌ Line ${
          lineIdx + 1
        } mismatch:\n   en.json: "${refKey}" != ${file}: "${currentKey}"`,
      );
      lineByLineCheckFailed = true;
    }
  }
}

if (lineByLineCheckFailed) {
  console.error("\n❌ Line-by-line synchronization check failed");
  process.exit(1);
}

console.log(
  "✅ Line-by-line verification passed: All keys at correct positions",
);
