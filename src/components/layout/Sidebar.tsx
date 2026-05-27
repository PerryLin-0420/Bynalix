import { NavLink } from "react-router-dom";
import { LayoutDashboard, UtensilsCrossed, Dumbbell, History, BarChart2, User, Activity, Settings } from "lucide-react";
import { clsx } from "clsx";
import { useLangStore } from "@/store/langStore";
import logoUrl from "../../../src-tauri/icons/128x128.png";

export const NAV_ITEMS = [
  { to: "/",          icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { to: "/food",      icon: UtensilsCrossed, labelKey: "nav.food" },
  { to: "/exercise",  icon: Dumbbell,        labelKey: "nav.exercise" },
  { to: "/body",      icon: Activity,        labelKey: "nav.body" },
  { to: "/history",   icon: History,         labelKey: "nav.history" },
  { to: "/stats",     icon: BarChart2,       labelKey: "nav.stats" },
  { to: "/profile",   icon: User,            labelKey: "nav.profile" },
  { to: "/settings",  icon: Settings,        labelKey: "nav.settings" },
] as const;

export function Sidebar() {
  const { t } = useLangStore();

  return (
    <nav className="hidden md:flex flex-col items-center gap-1 w-16 h-full py-4 border-r border-gray-100 shrink-0">
      {/* Logo */}
      <div className="w-9 h-9 rounded-xl overflow-hidden mb-4 shrink-0">
        <img src={logoUrl} alt="Bynálix" className="w-full h-full object-cover" />
      </div>

      <div className="flex flex-col gap-1 flex-1">
        {NAV_ITEMS.map(({ to, icon: Icon, labelKey }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              clsx(
                "flex flex-col items-center gap-1 w-12 py-2.5 rounded-xl text-[10px] font-medium transition-all",
                isActive
                  ? "bg-teal-500 text-white"
                  : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              )
            }
          >
            <Icon size={18} />
            {t(labelKey)}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
