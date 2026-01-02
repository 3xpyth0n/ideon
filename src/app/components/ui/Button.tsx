"use client";
import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  noRipple?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
}

export function Button({
  children,
  className = "",
  noRipple = false,
  variant,
  size,
  ...props
}: ButtonProps) {
  const variantClass = variant ? `btn-${variant}` : "";
  const sizeClass = size ? `btn-${size}` : "";

  return (
    <button
      className={`btn-base ${
        !noRipple ? "ripple" : ""
      } ${variantClass} ${sizeClass} ${className}`}
      {...props}
    >
      <span className="button-content">{children}</span>
    </button>
  );
}
