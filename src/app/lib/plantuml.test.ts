import { inflateRawSync } from "zlib";
import { afterEach, describe, expect, it } from "vitest";
import {
  encodePlantUMLSource,
  applyTransparentBackground,
  getPlantUMLServerUrl,
  parsePlantUMLError,
} from "./plantuml";

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

function decode(encoded: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; i += 4) {
    const c = [0, 1, 2, 3].map((n) => ALPHABET.indexOf(encoded[i + n]));
    bytes.push((c[0] << 2) | (c[1] >> 4));
    bytes.push(((c[1] & 0xf) << 4) | (c[2] >> 2));
    bytes.push(((c[2] & 0x3) << 6) | c[3]);
  }
  return inflateRawSync(Buffer.from(bytes), { finishFlush: 0 }).toString(
    "utf8",
  );
}

describe("encodePlantUMLSource", () => {
  it("round-trips through the PlantUML alphabet", () => {
    const source = "@startuml\nAlice -> Bob: Hello\n@enduml";
    const encoded = encodePlantUMLSource(source);
    expect(encoded).toMatch(/^[0-9A-Za-z_-]+$/);
    expect(decode(encoded)).toBe(source);
  });

  it("handles non-ASCII characters", () => {
    const source = "@startuml\nAlice -> Bob: café\n@enduml";
    expect(decode(encodePlantUMLSource(source))).toBe(source);
  });
});

describe("getPlantUMLServerUrl", () => {
  const original = process.env.PLANTUML_SERVER_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.PLANTUML_SERVER_URL;
    else process.env.PLANTUML_SERVER_URL = original;
  });

  it("returns null when unset or invalid", () => {
    delete process.env.PLANTUML_SERVER_URL;
    expect(getPlantUMLServerUrl()).toBeNull();
    process.env.PLANTUML_SERVER_URL = "ftp://example.com";
    expect(getPlantUMLServerUrl()).toBeNull();
    process.env.PLANTUML_SERVER_URL = "not a url";
    expect(getPlantUMLServerUrl()).toBeNull();
  });

  it("strips trailing slashes", () => {
    process.env.PLANTUML_SERVER_URL = "http://plantuml.internal:8080/";
    expect(getPlantUMLServerUrl()).toBe("http://plantuml.internal:8080");
  });
});

describe("parsePlantUMLError", () => {
  it("extracts the line and message from a PlantUML error image", () => {
    const svg = [
      "<svg>",
      '<text x="1" y="2">[From string (line 3) ]</text>',
      '<text x="1" y="3">this is not valid ((</text>',
      '<text x="1" y="4">Syntax Error? (Assumed diagram type: sequence)</text>',
      "</svg>",
    ].join("");
    expect(parsePlantUMLError(svg)).toEqual({
      detail: "Syntax Error? (Assumed diagram type: sequence)",
      line: 3,
    });
  });

  it("returns an empty result when no text is present", () => {
    expect(parsePlantUMLError("<svg></svg>")).toEqual({
      detail: "",
      line: null,
    });
  });
});

describe("applyTransparentBackground", () => {
  it("inserts the skinparam after the start directive", () => {
    expect(applyTransparentBackground("@startuml\nA -> B\n@enduml")).toEqual({
      source:
        "@startuml\nskinparam backgroundColor transparent\nA -> B\n@enduml",
      lineOffset: 1,
    });
  });

  it("leaves sources without a start directive untouched", () => {
    expect(applyTransparentBackground("A -> B")).toEqual({
      source: "A -> B",
      lineOffset: 0,
    });
  });
});
