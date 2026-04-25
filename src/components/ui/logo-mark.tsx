import { cn } from "@/lib/utils";

interface LogoMarkProps {
  size?: number;
  className?: string;
  outerColor?: string;
  innerColor?: string;
  title?: string;
}

export function LogoMark({
  size = 20,
  className,
  outerColor = "var(--accent)",
  innerColor = "var(--text)",
  title,
}: LogoMarkProps) {
  const labelled = Boolean(title);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 240 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={labelled ? "img" : undefined}
      aria-label={labelled ? title : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
      className={cn("shrink-0", className)}
    >
      {labelled ? <title>{title}</title> : null}
      <path
        d="M 120 30 C 145 70, 180 90, 180 140 C 180 185, 155 215, 120 215 C 85 215, 60 185, 60 140 C 60 110, 78 95, 95 80 C 105 95, 110 105, 110 120 C 120 95, 115 60, 120 30 Z"
        fill={outerColor}
      />
      <path
        d="M 120 90 C 138 115, 150 130, 150 155 C 150 180, 137 195, 120 195 C 103 195, 90 180, 90 158 C 90 145, 98 138, 108 130 C 113 145, 118 150, 120 145 C 120 130, 118 115, 120 90 Z"
        fill={innerColor}
      />
    </svg>
  );
}
