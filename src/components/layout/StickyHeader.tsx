import type { ReactNode } from "react";
import { clsx } from "clsx";

interface StickyHeaderProps {
  children: ReactNode;
  spaceY?: boolean;
  row?: boolean;
}

export function StickyHeader({ children, spaceY, row }: StickyHeaderProps) {
  return (
    <div
      className={clsx(
        "sticky top-0 z-30 -mx-4 md:-mx-6 px-4 md:px-6 pb-4 pt-1 md:pt-4 shrink-0",
        spaceY && "space-y-tight",
        row && "flex items-start justify-between"
      )}
      style={{ background: "var(--bg-main)", backgroundAttachment: "fixed" }}
    >
      {children}
    </div>
  );
}
