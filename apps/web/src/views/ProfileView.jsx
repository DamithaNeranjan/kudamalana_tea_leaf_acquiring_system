import { formatRole } from "../utils/format.js";

export function ProfileView({ currentUser }) {
  return (
    <section className="view active-view profile-panel">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Account</span>
            <h2>Profile Details</h2>
          </div>
        </div>
        <dl className="profile-details">
          <div>
            <dt>Display name</dt>
            <dd>{currentUser.displayName}</dd>
          </div>
          <div>
            <dt>Username</dt>
            <dd>{currentUser.username}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd><span className="session-role">{formatRole(currentUser.role)}</span></dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{currentUser.active ? "Active" : "Inactive"}</dd>
          </div>
        </dl>
      </section>
    </section>
  );
}
