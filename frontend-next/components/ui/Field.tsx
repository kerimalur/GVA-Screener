"use client";

import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
} from "react";

const CONTROL =
  "w-full bg-bg border border-border2 rounded-md px-3 py-1.5 text-[13px] text-text " +
  "placeholder:text-faint focus:border-accent focus:outline-none transition-colors " +
  "disabled:opacity-50";

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-1">
      <span className="text-[11px] font-medium text-muted uppercase tracking-wide">
        {children}
      </span>
      {hint && <span className="text-[10px] text-faint">{hint}</span>}
    </div>
  );
}

export function Input({
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${CONTROL} ${className}`} {...rest} />;
}

export function Select({
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${CONTROL} ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({
  className = "",
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${CONTROL} resize-y ${className}`} {...rest} />;
}

/** Label + Control gestapelt — Standardbaustein für Formulare */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <Label hint={hint}>{label}</Label>
      {children}
    </label>
  );
}
