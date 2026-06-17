import { formatRole, logoUrl } from "../utils/format.js";

export function Header({ currentUser, onLogout, onProfile }) {
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <img className="brand-logo topbar-logo" src={logoUrl} alt="Kudamalana Tea Factory logo" />
        <div>
          <h1>Kudamalana Tea Factory - Directors</h1>
          <p>Hosted green leaf book access</p>
        </div>
      </div>
      <div className="header-status">
        <button
          className={`profile-button ${currentUser ? "" : "hidden"}`}
          type="button"
          aria-label="Open profile details"
          title="Profile"
          onClick={onProfile}
        >
          <span className="profile-icon" aria-hidden="true"></span>
        </button>
        <span className="session-account">
          <span className="session-name">{currentUser?.displayName || "Not signed in"}</span>
          {currentUser && <span className="session-role">{formatRole(currentUser.role)}</span>}
        </span>
        <button className={`logout-button ${currentUser ? "" : "hidden"}`} type="button" onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}
