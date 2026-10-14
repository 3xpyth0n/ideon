"use client";

import { useCallback, useEffect, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useI18n } from "@providers/I18nProvider";
import { useTheme } from "@providers/ThemeProvider";
import { Loader2 } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { captureCanvasViewport } from "./canvasExport";

type FlowState =
  | "idle"
  | "sealing"
  | "capturing"
  | "generating"
  | "done"
  | "error";

function filenameFromDisposition(
  disposition: string | null,
  fallback: string,
): string {
  const match = disposition?.match(/filename="([^"]+)"/);
  return match?.[1] ?? fallback;
}

function triggerDownload(url: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function DossierFlow({
  isOpen,
  onClose,
  projectId,
}: {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}) {
  const { dict } = useI18n();
  const t = dict.project.instrument;
  const { theme, setTheme } = useTheme();
  const { getNodes, getNodesBounds } = useReactFlow();
  const [state, setState] = useState<FlowState>("idle");

  const runFlow = useCallback(async () => {
    setState("sealing");
    try {
      const sealRes = await fetch(`/api/projects/${projectId}/records/seal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!sealRes.ok) throw new Error("seal failed");
      const { seal } = (await sealRes.json()) as { seal: { id: string } };

      setState("capturing");
      // The dossier PDF is light-themed: capture through setTheme (re-renders
      // JS-styled blocks) with transitions off (the core block animates 300ms).
      setTheme("light");
      const noTransitions = document.createElement("style");
      noTransitions.textContent =
        "*, *::before, *::after { transition: none !important; animation: none !important; }";
      document.head.appendChild(noTransitions);
      let canvasImage: string | null = null;
      try {
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        canvasImage = await captureCanvasViewport(
          getNodes,
          getNodesBounds,
          "#fff",
        );
      } catch (error) {
        console.error("[dossier] canvas capture failed", error);
      } finally {
        noTransitions.remove();
        setTheme(theme);
      }

      setState("generating");
      const dossierRes = await fetch(
        `/api/projects/${projectId}/instrument/dossier`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sealId: seal.id,
            canvasImage: canvasImage ?? undefined,
          }),
        },
      );
      if (!dossierRes.ok) throw new Error("dossier failed");

      const blob = await dossierRes.blob();
      const objectUrl = URL.createObjectURL(blob);
      triggerDownload(
        objectUrl,
        filenameFromDisposition(
          dossierRes.headers.get("Content-Disposition"),
          "dossier.zip",
        ),
      );
      URL.revokeObjectURL(objectUrl);

      setState("done");
    } catch {
      setState("error");
    }
  }, [getNodes, getNodesBounds, projectId]);

  useEffect(() => {
    if (isOpen) {
      void runFlow();
    }
  }, [isOpen, runFlow]);

  const statusText =
    state === "sealing"
      ? t.dossierSealing
      : state === "capturing"
        ? t.dossierCapturing
        : state === "generating"
          ? t.dossierGenerating
          : state === "done"
            ? t.dossierDone
            : state === "error"
              ? t.dossierError
              : t.dossierDescription;

  const busy =
    state === "sealing" ||
    state === "capturing" ||
    state === "generating" ||
    state === "idle";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t.dossierTitle}
      className="max-w-md"
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm opacity-70">{statusText}</p>

        {busy && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {state === "done" && (
          <p className="text-xs opacity-40">{t.dossierVerifyHint}</p>
        )}

        {state === "error" && (
          <Button size="sm" onClick={() => void runFlow()}>
            {t.generateDossier}
          </Button>
        )}
      </div>
    </Modal>
  );
}
