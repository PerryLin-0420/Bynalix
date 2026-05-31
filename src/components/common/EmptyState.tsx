import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";

interface EmptyStateProps {
  icon: ComponentType<LucideProps>;
  message: string;
  height?: string;
  iconSize?: number;
}

export function EmptyState({ icon: Icon, message, height = "h-48", iconSize = 28 }: EmptyStateProps) {
  return (
    <div className={`${height} flex flex-col items-center justify-center text-[var(--text-on-surface-muted)] gap-2`}>
      <Icon size={iconSize} className="opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
