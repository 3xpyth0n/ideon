import { deflateRawSync } from "zlib";

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

export function encodePlantUMLSource(source: string): string {
  const bytes = deflateRawSync(Buffer.from(source, "utf8"), { level: 9 });
  let encoded = "";

  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b3 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    encoded += ALPHABET[b1 >> 2];
    encoded += ALPHABET[((b1 & 0x3) << 4) | (b2 >> 4)];
    encoded += ALPHABET[((b2 & 0xf) << 2) | (b3 >> 6)];
    encoded += ALPHABET[b3 & 0x3f];
  }

  return encoded;
}

export function applyTransparentBackground(source: string): {
  source: string;
  lineOffset: number;
} {
  const lines = source.split("\n");
  const startIndex = lines.findIndex((line) => /^\s*@start\w+/.test(line));
  if (startIndex === -1) return { source, lineOffset: 0 };

  lines.splice(startIndex + 1, 0, "skinparam backgroundColor transparent");
  return { source: lines.join("\n"), lineOffset: 1 };
}

export interface PlantUMLErrorInfo {
  detail: string;
  line: number | null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export function parsePlantUMLError(svg: string): PlantUMLErrorInfo {
  const texts = Array.from(svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g))
    .map((match) => decodeEntities(match[1]).trim())
    .filter(Boolean);

  const lineMatch = texts
    .map((text) => text.match(/\(line (\d+)\)/))
    .find((match) => match !== null);

  return {
    detail: texts[texts.length - 1] ?? "",
    line: lineMatch ? Number(lineMatch[1]) : null,
  };
}

export function getPlantUMLServerUrl(): string | null {
  const raw = process.env.PLANTUML_SERVER_URL?.trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}
