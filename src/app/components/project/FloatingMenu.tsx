"use client";
import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface Props {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onMouseDown?: (e: React.MouseEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
}

export default function FloatingMenu({
  children,
  className = "context-menu",
  style,
  onMouseDown,
  onClick,
}: Props) {
  const elRef = useRef<HTMLDivElement | null>(null);
  if (elRef.current === null && typeof document !== "undefined") {
    elRef.current = document.createElement("div");
  }

  useEffect(() => {
    const el = elRef.current!;
    document.body.appendChild(el);
    return () => {
      if (el.parentNode) el.parentNode.removeChild(el);
    };
  }, []);

  if (!elRef.current) return null;
  return createPortal(
    <div
      className={className}
      style={style}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      {children}
    </div>,
    elRef.current,
  );
}
