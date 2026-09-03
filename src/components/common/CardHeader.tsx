import type { ReactNode } from "react";

interface CardHeaderProps {
  title: ReactNode;
  action?: ReactNode;
  mb?: "mb-1" | "mb-3" | "mb-4";
}

export function CardHeader({ title, action, mb = "mb-4" }: CardHeaderProps) {
  if (!action) {
    return (
      <p className={`text-sm font-semibold text-[var(--text-on-surface)] ${mb}`}>
        {title}
      </p>
    );
  }
  return (
    <div className={`flex items-center justify-between ${mb}`}>
      <p className="text-sm font-semibold text-[var(--text-on-surface)]">{title}</p>
      {action}
    </div>
  );
}
