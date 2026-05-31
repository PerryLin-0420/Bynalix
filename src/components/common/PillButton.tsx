import { clsx } from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isActive: boolean;
  children: ReactNode;
  className?: string;
}

export function PillButton({ isActive, children, className, ...rest }: PillButtonProps) {
  return (
    <button
      {...rest}
      className={clsx(
        "rounded-lg font-medium transition-all",
        className,
        isActive
          ? "bg-white text-[var(--color-primary)] shadow-sm"
          : "text-[var(--text-on-bg-muted)] hover:text-[var(--text-on-bg)]"
      )}
    >
      {children}
    </button>
  );
}
