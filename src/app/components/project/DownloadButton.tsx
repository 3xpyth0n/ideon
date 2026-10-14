"use client";

import { useCallback } from "react";
import { useReactFlow, ControlButton } from "@xyflow/react";
import { Download } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { useTheme } from "@providers/ThemeProvider";
import { toast } from "sonner";
import { captureCanvasViewport } from "./canvasExport";

function downloadImage(dataUrl: string) {
  const a = document.createElement("a");
  a.setAttribute("download", "ideon-project.png");
  a.setAttribute("href", dataUrl);
  a.click();
}

export function DownloadButton() {
  const { getNodes, getNodesBounds } = useReactFlow();
  const { dict } = useI18n();
  const { theme } = useTheme();

  const onClick = useCallback(async () => {
    const image = await captureCanvasViewport(
      getNodes,
      getNodesBounds,
      theme === "dark" ? "#000" : "#fff",
    );
    if (image) {
      downloadImage(image);
      return;
    }
    toast.error(dict.blocks.downloadImageFailed);
  }, [dict.blocks.downloadImageFailed, getNodes, getNodesBounds, theme]);

  return (
    <ControlButton onClick={onClick} title={dict.common.export}>
      <Download size={16} />
    </ControlButton>
  );
}
