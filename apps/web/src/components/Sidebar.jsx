export function Sidebar({ activeView, currentUser, onNavigate }) {
  const canViewManagedUsers = ["super_admin", "director"].includes(currentUser?.role);
  const items = [
    { id: "book", label: "Green Leaf Book" },
    ...(canViewManagedUsers
      ? [
          { id: "directors", label: "Directors" },
          { id: "officeUsers", label: "Office Users" }
        ]
      : [])
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-title">
        <span className="eyebrow">Portal menu</span>
        <strong>Workspace</strong>
      </div>
      <nav className="menu" aria-label="Portal sections">
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
