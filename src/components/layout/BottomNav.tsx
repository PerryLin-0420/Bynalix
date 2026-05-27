import { NavLink } from "react-router-dom";
import { clsx } from "clsx";
import { useLangStore } from "@/store/langStore";
import { NAV_ITEMS } from "./Sidebar";

export function BottomNav() {
  const { t } = useLangStore();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50
                 bg-[var(--surface)] border-t border-[var(--surface-border)]
                 flex overflow-x-auto overscroll-x-contain
                 safe-area-bottom"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {NAV_ITEMS.map(({ to, icon: Icon, labelKey }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            clsx(
              "flex flex-col items-center justify-center gap-0.5 shrink-0",
              "min-w-[44px] flex-1 py-2 px-0.5 text-[9px] font-medium transition-all",
              "active:scale-95",
              isActive
                ? "text-[var(--text-accent)] font-bold"
                : "text-[var(--text-on-surface-muted)]"
            )
          }
        >
          {({ isActive }) => (
            <>
              <span className={clsx(
                "w-8 h-8 flex items-center justify-center rounded-xl transition-all",
                isActive
                  ? "bg-[var(--surface-container-low)] border border-[var(--color-secondary-container)]"
                  : "border border-transparent"
              )}>
                <Icon
                  size={20}
                  className={isActive
                    ? "text-[var(--text-accent)]"
                    : "text-[var(--text-on-surface-muted)]"}
                />
              </span>
              <span>{t(labelKey)}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
