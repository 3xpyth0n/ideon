import { memo } from "react";
import { useReactFlow } from "@xyflow/react";
import { HelperLine } from "./utils/alignment";

interface HelperLinesProps {
  helperLines: HelperLine[];
}

const HelperLines = memo(function HelperLines({
  helperLines,
}: HelperLinesProps) {
  const { getViewport } = useReactFlow();

  if (helperLines.length === 0) return null;

  const viewport = getViewport();
  const { zoom, x: vpX, y: vpY } = viewport;

  return (
    <>
      {helperLines.map((line, index) => {
        if (line.type === "horizontal") {
          const screenY = line.position * zoom + vpY;
          return (
            <div
              key={`h-${index}-${line.position}`}
              className="helper-line-horizontal"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: `${screenY}px`,
                height: "0px",
                borderTop: "1.5px dashed var(--accent)",
                opacity: 0.8,
                pointerEvents: "none",
              }}
            />
          );
        } else {
          const screenX = line.position * zoom + vpX;
          return (
            <div
              key={`v-${index}-${line.position}`}
              className="helper-line-vertical"
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${screenX}px`,
                width: "0px",
                borderLeft: "1.5px dashed var(--accent)",
                opacity: 0.8,
                pointerEvents: "none",
              }}
            />
          );
        }
      })}
    </>
  );
});

export default HelperLines;
