import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ComponentPropsWithoutRef } from "react";

type Variant = "primary" | "outline" | "ghost";

interface BaseProps {
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}

type LinkButtonProps =
  | (BaseProps & ComponentPropsWithoutRef<"button"> & { href?: never })
  | (BaseProps & { href: string; target?: string; rel?: string });

const variantStyles: Record<Variant, React.CSSProperties> = {
  primary: {
    backgroundColor: "var(--accent)",
    color: "var(--accent-fg)",
    border: "1px solid var(--accent)",
  },
  outline: {
    backgroundColor: "transparent",
    color: "var(--text)",
    border: "1px solid var(--border)",
  },
  ghost: {
    backgroundColor: "transparent",
    color: "var(--muted)",
    border: "1px solid transparent",
  },
};

export function LinkButton({
  variant = "primary",
  className,
  children,
  ...props
}: LinkButtonProps) {
  const base = cn(
    "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5",
    "text-sm font-medium tracking-tight transition-opacity cursor-pointer",
    "hover:opacity-80 focus-visible:outline-none focus-visible:ring-2",
    className,
  );

  if ("href" in props && props.href) {
    const { href, target, rel, ...rest } = props as BaseProps & {
      href: string;
      target?: string;
      rel?: string;
    };
    const isExternal = href.startsWith("http");
    return (
      <Link
        href={href}
        target={isExternal ? "_blank" : target}
        rel={isExternal ? "noopener noreferrer" : rel}
        className={base}
        style={variantStyles[variant]}
        {...(rest as object)}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      className={base}
      style={variantStyles[variant]}
      {...(props as ComponentPropsWithoutRef<"button">)}
    >
      {children}
    </button>
  );
}
