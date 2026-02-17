"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import chroma from "chroma-js";
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

  // Click outside to save
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // If we're dragging, don't close
      if (document.body.style.cursor === "grabbing") return;

      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node)
      ) {
        handleSaveAndClose();
      }
    };

    // Use setTimeout to avoid immediate close if the click that opened it bubbles up
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100); // Increased delay to ensure event propagation is complete

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [handleSaveAndClose]);

  // Keyboard
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") handleSaveAndClose();
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleSaveAndClose, onClose]);

  if (!mounted) return null;

  const style: React.CSSProperties = position
    ? {
        left: position.x,
        top: position.y - 10, // Slight offset
      }
    : {};

  const positionClasses = position
    ? "fixed z-[9999] mt-0 -translate-x-1/2 -translate-y-full"
    : "";

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
            title="Current Color"
          />
          <div className="color-picker-field">
            <input
              value={hexInput}
              onChange={handleHexChange}
              placeholder="HEX"
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
