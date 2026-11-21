import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatedAction } from "@lib/server-utils";
import {
  applyTransparentBackground,
  encodePlantUMLSource,
  getPlantUMLServerUrl,
  parsePlantUMLError,
} from "@lib/plantuml";
import { PLANTUML_NOT_CONFIGURED } from "@lib/plantuml-shared";

export const dynamic = "force-dynamic";

const RENDER_TIMEOUT_MS = 10_000;
const MAX_SOURCE_LENGTH = 20_000;
const MAX_SVG_BYTES = 5 * 1024 * 1024;

const schema = z.object({
  source: z.string().min(1).max(MAX_SOURCE_LENGTH),
});

export const POST = authenticatedAction<
  { svg: string } | { error: string; detail: string; line: number | null },
  z.infer<typeof schema>
>(
  async (_req, { body }) => {
    const serverUrl = getPlantUMLServerUrl();
    if (!serverUrl) {
      throw { status: 424, message: PLANTUML_NOT_CONFIGURED };
    }

    const { source, lineOffset } = applyTransparentBackground(body.source);
    const response = await fetch(
      `${serverUrl}/svg/${encodePlantUMLSource(source)}`,
      {
        redirect: "error",
        signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
      },
    ).catch(() => {
      throw { status: 424, message: "PlantUML server is unreachable" };
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("image/svg+xml")) {
      throw { status: 424, message: "PlantUML server returned invalid data" };
    }

    const svg = await response.text();
    if (svg.length > MAX_SVG_BYTES) {
      throw { status: 424, message: "PlantUML diagram is too large" };
    }

    if (!response.ok) {
      const { detail, line } = parsePlantUMLError(svg);
      return NextResponse.json(
        {
          error: "PlantUML could not render this diagram",
          detail,
          line: line !== null && line > lineOffset ? line - lineOffset : null,
        },
        { status: 422 },
      );
    }

    return { svg };
  },
  { schema, requireUser: true },
);
