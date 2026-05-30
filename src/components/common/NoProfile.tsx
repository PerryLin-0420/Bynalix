import { useLangStore } from "@/store/langStore";

export function NoProfile() {
  const { t } = useLangStore();
  return (
    <div className="flex items-center justify-center h-full text-[var(--text-on-bg-muted)] text-sm">
      {t("common.noProfile")}
    </div>
  );
}
