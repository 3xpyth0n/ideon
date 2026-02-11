"use client";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack?: () => void;
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  className?: string;
  showCloseButton?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  onBack,
  children,
  title,
  subtitle,
  className = "",
  showCloseButton = true,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-content ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {onBack && (
          <button onClick={onBack} className="modal-back-btn">
            <ChevronLeft size={20} />
          </button>
        )}

        {showCloseButton && (
          <button onClick={onClose} className="modal-close-btn">
            <X size={20} />
          </button>
        )}

        {title && (
          <h2 className="text-xl font-bold mb-1 uppercase tracking-widest">
            {title}
          </h2>
        )}
        {subtitle && (
          <p className="text-2xs font-bold uppercase tracking-[0.2em] opacity-30 mb-8">
            {subtitle}
          </p>
        )}

        {children}
      </div>
    </div>,
    document.body,
  );
}
