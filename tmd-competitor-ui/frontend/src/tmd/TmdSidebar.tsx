import { ChevronLeft, CircleDollarSign, Coins, Database, type LucideIcon } from "lucide-react";
import type { DashboardView, TmdNavItem } from "./navigation";

type TmdSidebarProps = {
  activePage: DashboardView;
  collapsed: boolean;
  items: readonly TmdNavItem[];
  onPageChange: (page: DashboardView) => void;
  onToggle: () => void;
};

const navPresentation: Partial<
  Record<DashboardView, { Icon?: LucideIcon; iconText?: string }>
> = {
  "newfund-hkd": { iconText: "HK$" },
  "newfund-usd": { Icon: CircleDollarSign },
  "newfund-rmb": { iconText: "¥" },
  "newfund-aud": { iconText: "A$" },
  "fx-tmd": { Icon: Coins },
  "detail-data": { Icon: Database },
};

export function TmdSidebar({ activePage, collapsed, items, onPageChange, onToggle }: TmdSidebarProps) {
  return (
    <aside className={`dashboard-sidebar ${collapsed ? "is-collapsed" : ""}`}>
      <button
        type="button"
        className="dashboard-sidebar-toggle"
        onClick={onToggle}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
      >
        <ChevronLeft size={12} strokeWidth={2} className="dashboard-sidebar-toggle-icon" aria-hidden="true" />
      </button>

      <div className="dashboard-sidebar-brand">
        <div className="dashboard-sidebar-mark" aria-hidden="true">
          P
        </div>
        {collapsed ? null : (
          <div className="dashboard-sidebar-brand-copy">
            <p>Pricing Radar</p>
            <span>Time Deposit</span>
          </div>
        )}
      </div>
      {collapsed ? null : <p className="dashboard-sidebar-section-label">Official Website</p>}
      <nav className="sidebar-nav" aria-label="Dashboard pages">
        {items.map((page) => {
          const presentation = navPresentation[page.key] ?? {};
          const Icon = presentation.Icon;
          return (
            <button
              key={page.key}
              type="button"
              title={collapsed ? page.label : undefined}
              className={`sidebar-nav-item ${activePage === page.key ? "is-active" : ""}`}
              onClick={() => onPageChange(page.key)}
            >
              <span className="sidebar-nav-icon" aria-hidden="true">
                {presentation.iconText ? presentation.iconText : Icon ? <Icon size={15} strokeWidth={1.7} /> : null}
              </span>
              {collapsed ? null : <span className="sidebar-nav-label">{page.label}</span>}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
