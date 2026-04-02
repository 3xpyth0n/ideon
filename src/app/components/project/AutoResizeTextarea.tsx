"use client";
import React, { useRef, useLayoutEffect, useCallback } from "react";

interface Props {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onFocus?: () => void;
  autoFocus?: boolean;
  onBlur?: () => void;
}

export default function AutoResizeTextarea({
  value,
  onChange,
  className,
  placeholder,
  readOnly,
  onKeyDown,
  onFocus,
  autoFocus,
  onBlur,
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const adjustHeight = useCallback(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, []);

  useLayoutEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => {
        adjustHeight();
        onChange(e);
      }}
      className={className}
      placeholder={placeholder}
      readOnly={readOnly}
      rows={1}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      autoFocus={autoFocus}
      style={{ resize: "none", overflow: "hidden" }}
    />
  );
}
