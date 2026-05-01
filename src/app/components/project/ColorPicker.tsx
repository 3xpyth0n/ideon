"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import chroma from "chroma-js";
import { useI18n } from "@providers/I18nProvider";
import "./color-picker.css";

interface ColorPickerProps {
  initialColor: string;
  onSelect: (color: string) => void;
  onClose?: () => void;
  position?: { x: number; y: number };
}

const ColorPicker: React.FC<ColorPickerProps> = ({
  initialColor,
  onSelect,
  onClose,
  position,
}) => {
  const { dict } = useI18n();
  const pickerRef = useRef<HTMLDivElement>(null);
  const saturationRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Helper to parse color
  const parseColor = useCallback((c: string) => {
    try {
      if (!chroma.valid(c)) return { h: 0, s: 1, v: 1, hex: "#000000" };
      const [h, s, v] = chroma(c).hsv();
      return {
        h: isNaN(h) ? 0 : h,
        s: isNaN(s) ? 0 : s,
        v: isNaN(v) ? 0 : v,
        hex: c,
      };
    } catch {
      return { h: 0, s: 1, v: 1, hex: "#000000" };
    }
  }, []);

  const [hsv, setHsv] = useState(() => parseColor(initialColor));
  const [hexInput, setHexInput] = useState(initialColor);
  const [adjustedPos, setAdjustedPos] = useState<{
    left: number;
    top: number;
  } | null>(null);

  useEffect(() => {
    setHsv(parseColor(initialColor));
    setHexInput(initialColor);
  }, [initialColor, parseColor]);

  const handleSaturationChange = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      if (!saturationRef.current) return;
      const rect = saturationRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

      const s = x;
      const v = 1 - y;

      setHsv((prev) => {
        const newColor = chroma.hsv(prev.h, s, v).hex();
        setHexInput(newColor);
        return { ...prev, s, v, hex: newColor };
      });
    },
    [],
  );

  const handleHueChange = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!hueRef.current) return;
    const rect = hueRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

    const h = x * 360;

    setHsv((prev) => {
      const newColor = chroma.hsv(h, prev.s, prev.v).hex();
      setHexInput(newColor);
      return { ...prev, h, hex: newColor };
    });
  }, []);

  // Dragging logic for Saturation
  const handleSaturationMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    document.body.style.cursor = "grabbing";
    handleSaturationChange(e);
    const handleMouseMove = (e: MouseEvent) => handleSaturationChange(e);
    const handleMouseUp = () => {
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Dragging logic for Hue
  const handleHueMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    document.body.style.cursor = "grabbing";
    handleHueChange(e);
    const handleMouseMove = (e: MouseEvent) => handleHueChange(e);
    const handleMouseUp = () => {
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setHexInput(val);
    if (chroma.valid(val)) {
      setHsv(parseColor(val));
    }
  };

  const handleSaveAndClose = useCallback(() => {
    if (chroma.valid(hexInput)) {
      onSelect(chroma(hexInput).hex());
    } else {
      onClose?.();
    }
  }, [hexInput, onSelect, onClose]);

  const handleSaveAndCloseRef = useRef(handleSaveAndClose);
  useEffect(() => {
    handleSaveAndCloseRef.current = handleSaveAndClose;
  }, [handleSaveAndClose]);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Click outside to save — capture phase bypasses React Flow's stopPropagation
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!pickerRef.current) return;
      if (document.body.style.cursor === "grabbing") return;
      if (!pickerRef.current.contains(e.target as Node)) {
        handleSaveAndCloseRef.current();
      }
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, []);

  // Keyboard — refs keep callbacks fresh without re-registering
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") handleSaveAndCloseRef.current();
      if (e.key === "Escape") onCloseRef.current?.();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Compute viewport-safe position after first paint
  useEffect(() => {
    if (!position || !pickerRef.current) return;
    const rect = pickerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const MARGIN = 8;

    let left = position.x - rect.width / 2;
    let top = position.y - rect.height - 10;

    left = Math.max(MARGIN, Math.min(left, vw - rect.width - MARGIN));
    if (top < MARGIN) top = position.y + 10;
    top = Math.max(MARGIN, Math.min(top, vh - rect.height - MARGIN));

    setAdjustedPos({ left, top });
  }, [position, mounted]);

  if (!mounted) return null;

  const style: React.CSSProperties = position
    ? {
        left: adjustedPos?.left ?? position.x,
        top: adjustedPos?.top ?? position.y - 10,
        opacity: adjustedPos ? 1 : 0,
      }
    : {};

  const positionClasses = position ? "fixed z-9999 mt-0" : "";

  const pickerContent = (
    <div
      className={`color-picker-popover ${positionClasses}`}
      ref={pickerRef}
      style={style}
      onClick={(e) => e.stopPropagation()} // Prevent clicks inside from closing
    >
      <div className="color-picker-container">
        {/* Saturation/Brightness Area */}
        <div
          className="color-picker-saturation"
          ref={saturationRef}
          onMouseDown={handleSaturationMouseDown}
          style={{ backgroundColor: chroma.hsv(hsv.h, 1, 1).hex() }}
        >
          <div className="saturation-white" />
          <div className="saturation-black" />
          <div
            className="saturation-cursor"
            style={{
              left: `${hsv.s * 100}%`,
              top: `${(1 - hsv.v) * 100}%`,
              backgroundColor: hsv.hex,
            }}
          />
        </div>

        {/* Hue Slider */}
        <div
          className="color-picker-hue"
          ref={hueRef}
          onMouseDown={handleHueMouseDown}
        >
          <div
            className="hue-cursor"
            style={{
              left: `${(hsv.h / 360) * 100}%`,
              backgroundColor: chroma.hsv(hsv.h, 1, 1).hex(),
            }}
          />
        </div>

        {/* Controls */}
        <div className="color-picker-fields">
          <div
            className="color-preview"
            style={{ backgroundColor: hsv.hex }}
            title={dict.blocks.currentColor}
          />
          <div className="color-picker-field">
            <input
              value={hexInput}
              onChange={handleHexChange}
              placeholder={dict.blocks.hexPlaceholder}
              className="hex-input"
            />
          </div>
        </div>
      </div>
    </div>
  );

  if (position) {
    return createPortal(pickerContent, document.body);
  }

  return pickerContent;
};

export default ColorPicker;
