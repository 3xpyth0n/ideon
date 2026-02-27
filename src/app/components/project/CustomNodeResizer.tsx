"use client";

import { memo, useMemo } from "react";
import { NodeResizer, NodeResizerProps, useViewport } from "@xyflow/react";
import styles from "./CustomNodeResizer.module.css";

const TARGET_HITBOX_SIZE_PX = 60;
const MIN_HITBOX_SIZE = 30;
const MAX_HITBOX_SIZE = 100;

const CustomNodeResizer = memo((props: NodeResizerProps) => {
  const { zoom } = useViewport();

  const hitboxSize = useMemo(() => {
    if (!zoom || zoom <= 0) return MIN_HITBOX_SIZE;
    const size = TARGET_HITBOX_SIZE_PX / zoom;
    return Math.min(Math.max(size, MIN_HITBOX_SIZE), MAX_HITBOX_SIZE);
  }, [zoom]);

  const handleStyle = useMemo(
    () =>
      ({
        ...props.handleStyle,
        "--hitbox-size": `${hitboxSize}px`,
        pointerEvents: "auto",
      }) as React.CSSProperties,
    [hitboxSize, props.handleStyle],
  );

  return (
    <NodeResizer
      {...props}
      handleClassName={`${styles.handle} ${props.handleClassName || ""}`}
      handleStyle={handleStyle}
    />
  );
});

CustomNodeResizer.displayName = "CustomNodeResizer";

export default CustomNodeResizer;
