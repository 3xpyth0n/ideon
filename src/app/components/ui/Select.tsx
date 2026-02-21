"use client";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
  triggerClassName?: string;
  dropdownClassName?: string;
  optionClassName?: string;
  align?: "left" | "right";
  disabled?: boolean;
}

export function Select({
  value,
  options,
  onChange,
  className = "",
  triggerClassName = "",
  dropdownClassName = "",
  optionClassName = "",
  align = "left",
  disabled = false,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

  const selectedOption =
    options.find((opt) => opt.value === value) || options[0];

  const updateCoords = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom,
        left: rect.left,
        width: rect.width,
      });
    }
  };

  useLayoutEffect(() => {
    if (isOpen) {
      updateCoords();
    }
  }, [isOpen]);

  useEffect(() => {
    let animationFrameId: number;

    const update = () => {
      updateCoords();
      if (isOpen) {
        animationFrameId = requestAnimationFrame(update);
      }
    };

    if (isOpen) {
      window.addEventListener("resize", updateCoords);
      window.addEventListener("scroll", updateCoords, true);
      animationFrameId = requestAnimationFrame(update);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", updateCoords);
      window.removeEventListener("scroll", updateCoords, true);
    };
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // If we click on a trigger, and it's NOT our own trigger, we should close.
      const clickedTrigger = (target as HTMLElement).closest(".select-trigger");
      const isOurTrigger =
        triggerRef.current && triggerRef.current.contains(target);

      if (clickedTrigger && !isOurTrigger) {
        setIsOpen(false);
        return;
      }

      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside, true);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside, true);
  }, []);

  return (
    <div className={`custom-select ${className}`} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          if (disabled) return;
          if (!isOpen) {
            updateCoords();
            setIsOpen(true);
          } else {
            setIsOpen(false);
          }
        }}
        className={`select-trigger ${triggerClassName} ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        <span>{selectedOption.label}</span>
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 opacity-40 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className="portal-dropdown-wrapper fixed z-[99999] w-auto"
            style={{
              top: `${coords.top + 4}px`,
              left:
                align === "right"
                  ? `${coords.left + coords.width}px`
                  : `${coords.left}px`,
              transform: align === "right" ? "translateX(-100%)" : "none",
            }}
          >
            <div
              className={`select-dropdown w-auto min-w-max ${dropdownClassName}`}
            >
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`select-option ${optionClassName} ${
                    option.value === value ? "active" : ""
                  }`}
                >
                  <span>{option.label}</span>
                  {option.value === value && (
                    <Check size={14} className="opacity-40" />
                  )}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
