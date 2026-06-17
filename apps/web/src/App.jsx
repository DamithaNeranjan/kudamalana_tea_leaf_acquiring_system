import { useEffect, useState } from "react";
import { request } from "./api/client.js";
import { Header } from "./components/Header.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { ToastHost } from "./components/ToastHost.jsx";
import { BookView } from "./views/BookView.jsx";
import { DirectorsView } from "./views/DirectorsView.jsx";
import { LoginView } from "./views/LoginView.jsx";
import { OfficeUsersView } from "./views/OfficeUsersView.jsx";
import { ProfileView } from "./views/ProfileView.jsx";

function AppShell({ activeView, currentUser, onNavigate, showToast }) {
  const canViewManagedUsers = ["super_admin", "director"].includes(currentUser.role);
  const canManageUsers = currentUser.role === "super_admin";

  return (
    <main className="app-shell">
      <Sidebar activeView={activeView} currentUser={currentUser} onNavigate={onNavigate} />
      <section className="content">
        {activeView === "book" && <BookView />}
        {activeView === "directors" && canViewManagedUsers && (
          <DirectorsView canManage={canManageUsers} showToast={showToast} />
        )}
        {activeView === "officeUsers" && canViewManagedUsers && (
          <OfficeUsersView canManage={canManageUsers} showToast={showToast} />
        )}
        {activeView === "profile" && <ProfileView currentUser={currentUser} />}
      </section>
    </main>
  );
}

export default function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeView, setActiveView] = useState("book");
  const [toasts, setToasts] = useState([]);

  function showToast(message, type = "success") {
    const id = crypto.randomUUID();
    setToasts((items) => [...items, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((items) => items.filter((toast) => toast.id !== id));
    }, 3200);
  }

  function handleLogin(user) {
    setCurrentUser(user);
    setActiveView("book");
  }

  function handleLogout() {
    request("/auth/logout", { method: "POST" }).catch(() => {});
    setCurrentUser(null);
    setActiveView("book");
  }

  useEffect(() => {
    async function restoreSession() {
      try {
        const session = await request("/auth/me");
        if (session.user) setCurrentUser(session.user);
      } catch (error) {
        setCurrentUser(null);
      } finally {
        setAuthLoading(false);
      }
    }
    restoreSession();
  }, []);

  return (
    <>
      <Header
        currentUser={currentUser}
        onLogout={handleLogout}
        onProfile={() => setActiveView("profile")}
      />
      {!authLoading && !currentUser && <LoginView onLogin={handleLogin} />}
      {!authLoading && currentUser && (
        <AppShell
          activeView={activeView}
          currentUser={currentUser}
          onNavigate={setActiveView}
          showToast={showToast}
        />
      )}
      <ToastHost toasts={toasts} />
    </>
  );
}
