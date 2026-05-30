import type { ReactNode } from "react";
import { X } from "lucide-react";
import { clsx } from "clsx";
import { useSwipeClose } from "@/hooks/useSwipe";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function HistoryDrawerShell({ open, title, onClose, children }: Props) {
  const swipeClose = useSwipeClose(onClose);
  return (
    <>
      <div
        className={clsx(
          "fixed inset-0 bg-black/40 z-[55] transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />
      <div
        className={clsx(
          "fixed top-0 right-0 h-full w-full sm:w-[360px] bg-white shadow-2xl z-[60] flex flex-col transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full"
        )}
        {...swipeClose}
      >
        <div className="shrink-0" style={{ height: "env(safe-area-inset-top)" }} />
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-2 -mr-1 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}
