"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: string; // Phosphor-Klasse, z.B. "ph-plus"
  children?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent/15 text-accent border border-accent/40 hover:bg-accent/25",
  ghost: "bg-transparent text-muted border border-border2 hover:text-text hover:border-faint",
  danger: "bg-down/10 text-down border border-down/40 hover:bg-down/20",
  subtle: "bg-surface2 text-muted border border-transparent hover:text-text",
};

const SIZES: Record<Size, string> = {
  sm: "px-2.5 py-1 text-[11px] gap-1.5",
  md: "px-3.5 py-1.5 text-[13px] gap-2",
};

export default function Button({
  variant = "primary",
  size = "md",
  icon,
  children,
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {icon && <i className={`ph-bold ${icon} text-[1.15em]`} />}
      {children}
    </button>
  );
}
