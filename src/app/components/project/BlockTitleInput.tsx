import type React from "react";

type BlockTitleInputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function BlockTitleInput({
  className = "block-title nodrag",
  onMouseDown,
  onClick,
  ...props
}: BlockTitleInputProps) {
  return (
    <input
      className={className}
      onMouseDown={(e) => {
        e.stopPropagation();
        onMouseDown?.(e);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      {...props}
    />
  );
}
