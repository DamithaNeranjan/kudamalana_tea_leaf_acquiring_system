export function Sidebar({ activeView, currentUser, onNavigate, collapsed, onToggle }) {
  const canViewDirectors = ["super_admin", "director"].includes(currentUser?.role);
  const canViewOfficeUsers = ["super_admin", "director", "office_user"].includes(currentUser?.role);
  const canViewAudit = currentUser?.role === "super_admin";
  const items = [
    { id: "book", label: "Green Leaf Book" },
    { id: "balances", label: "Balances" },
    { id: "advances", label: "Advances" }
  ];
  if (canViewDirectors) items.push({ id: "directors", label: "Directors" });
  if (canViewOfficeUsers) items.push({ id: "officeUsers", label: "Office Users" });
  if (canViewAudit) items.push({ id: "audit", label: "Audit Trail" });

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">
          <span className="eyebrow">Portal menu</span>
          <strong>Workspace</strong>
        </div>
        <button
          className="sidebar-toggle"
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          aria-controls="portalNavigation"
          onClick={onToggle}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
            <path d="m14 6-6 6 6 6" />
          </svg>
        </button>
      </div>
      <nav id="portalNavigation" className="menu" aria-label="Portal sections" hidden={collapsed}>
        {items.map((item) => (
          <button
            className={`menu-item ${activeView === item.id ? "active" : ""}`}
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
