import { NavLink } from "react-router";
import { QuickSearch } from "@/features/search/components/QuickSearch";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { NAV_SECTIONS } from "./nav";
import { UserMenu } from "./UserMenu";

export function Sidebar({ username }: { username: string }) {
  return (
    <aside className="flex w-64 shrink-0 flex-col bg-ink text-slate-300">
      <div className="border-b border-white/10 px-5 py-6">
        <Logo />
      </div>
      <div className="px-3 pt-4">
        <QuickSearch />
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {NAV_SECTIONS.map((section, i) => (
          <div key={section.title ?? i}>
            {section.title && (
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                {section.title}
              </p>
            )}
            <div className="space-y-1">
              {section.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-brand-600 text-white shadow-sm"
                        : "hover:bg-white/5 hover:text-white",
                    )
                  }
                >
                  <Icon className="size-4" />
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <UserMenu username={username} />
      </div>
    </aside>
  );
}
