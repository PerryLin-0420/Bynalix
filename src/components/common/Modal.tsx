import type { ReactNode } from "react";

// ─── Bottom Sheet ─────────────────────────────────────────────────────────────
// Mobile-first panel that slides up from the bottom.
// Inner card: max-w-2xl, rounded-t-3xl, flex-col scroll shell.

interface BottomSheetProps {
  children: ReactNode;
  maxH?: string;             // Tailwind max-h class, default "max-h-[90vh]"
  mdPb?: "md:pb-4" | "md:pb-0"; // desktop bottom padding, default "md:pb-4"
}

export function BottomSheet({ children, maxH = "max-h-[90vh]", mdPb = "md:pb-4" }: BottomSheetProps) {
  return (
    <div className={`fixed inset-0 bg-black/50 z-[60] flex items-end justify-center pb-16 ${mdPb}`}>
      <div className={`bg-[var(--surface)] w-full max-w-2xl rounded-t-3xl shadow-2xl flex flex-col ${maxH}`}>
        {children}
      </div>
    </div>
  );
}

// ─── Dialog ───────────────────────────────────────────────────────────────────
// Centered modal dialog.
// Inner card: rounded-2xl, configurable max-width / padding / spacing.

interface DialogProps {
  children: ReactNode;
  maxWidth?: string;                       // Tailwind max-w class, default "max-w-sm"
  padding?: "p-5" | "p-6";                // default "p-5"
  spaceY?: "space-y-form" | "space-y-5";     // default "space-y-form"
  opacity?: "bg-black/40" | "bg-black/60"; // backdrop, default "bg-black/40"
}

export function Dialog({
  children,
  maxWidth = "max-w-sm",
  padding = "p-5",
  spaceY = "space-y-form",
  opacity = "bg-black/40",
}: DialogProps) {
  return (
    <div className={`fixed inset-0 ${opacity} z-[60] flex items-center justify-center p-4`}>
      <div className={`bg-[var(--surface)] w-full ${maxWidth} rounded-2xl shadow-2xl ${padding} ${spaceY}`}>
        {children}
      </div>
    </div>
  );
}
