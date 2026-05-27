import { clsx } from "clsx";

interface Props {
  msg: { text: string; ok: boolean } | null;
}

export function ExportToast({ msg }: Props) {
  if (!msg) return null;
  return (
    <div className={clsx(
      "fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-[65]",
      "px-5 py-2 rounded-full text-sm font-medium text-white shadow-lg whitespace-nowrap pointer-events-none",
      msg.ok ? "bg-teal-500" : "bg-red-500",
    )}>
      {msg.text}
    </div>
  );
}
