interface VercelIconProps {
  size?: number;
  className?: string;
}

export function VercelIcon({ size = 24, className = "" }: VercelIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 76 65"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
    </svg>
  );
}
