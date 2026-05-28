import { clsx } from "clsx";
import { useToastStore } from "@/store/toastStore";

/** Global host — mount once at the App root. */
export function ToastHost() {
  const toast = useToastStore((s) => s.toast);
  if (!toast) return null;
  const bg =
    toast.kind === "ok"    ? "bg-teal-500"
    : toast.kind === "error" ? "bg-red-500"
    : "bg-gray-800";
  return (
    <div
      className={clsx(
        "fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-[9999]",
        "px-5 py-2 rounded-full text-sm font-medium text-white shadow-lg",
        "whitespace-nowrap max-w-[90vw] truncate pointer-events-none",
        bg,
      )}
    >
      {toast.text}
    </div>
  );
}
