"use client";

import { useCallback } from "react";
import {
  useReactFlow,
  getViewportForBounds,
  ControlButton,
} from "@xyflow/react";
import { toPng } from "html-to-image";
import { Download } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { useTheme } from "@providers/ThemeProvider";
import { toast } from "sonner";

function downloadImage(dataUrl: string) {
  const a = document.createElement("a");
  a.setAttribute("download", "ideon-project.png");
  a.setAttribute("href", dataUrl);
  a.click();
}

const imageWidth = 1024;
const imageHeight = 768;

export function DownloadButton() {
  const { getNodes, getNodesBounds } = useReactFlow();
  const { dict } = useI18n();
  const { theme } = useTheme();

  const onClick = useCallback(() => {
    const nodesBounds = getNodesBounds(getNodes());

    if (nodesBounds.width === 0 || nodesBounds.height === 0) {
      return;
    }

    const transform = getViewportForBounds(
      nodesBounds,
      imageWidth,
      imageHeight,
      0.5,
      2,
      0.2,
    );

    const viewport = document.querySelector(
      ".react-flow__viewport",
    ) as HTMLElement;

    if (viewport) {
      toPng(viewport, {
        backgroundColor: theme === "dark" ? "#000" : "#fff",
        width: imageWidth,
        height: imageHeight,
        skipFonts: true,
        style: {
          width: String(imageWidth),
          height: String(imageHeight),
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
        },
      })
        .then(downloadImage)
        .catch((err) => {
          console.error("Download failed", err);
          toast.error("Failed to download image");
        });
    }
  }, [getNodes, theme]);

  return (
    <ControlButton
      onClick={onClick}
      title={dict.common.export || "Download Image"}
    >
      <Download size={16} />
    </ControlButton>
  );
}
