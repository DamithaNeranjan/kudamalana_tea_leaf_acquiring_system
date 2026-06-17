import { useEffect, useState } from "react";
import { request } from "../api/client.js";

const ROLE_COPY = {
  director: {
    title: "Directors",
    eyebrow: "User directory",
    description: "Create director logins and review existing director accounts.",
    readOnlyDescription: "Review director accounts without changing account details.",
    createTitle: "Create Director",
    displayPlaceholder: "Director full name",
    usernamePlaceholder: "director-username",
    empty: "No directors have been created yet.",
    createdToast: "Director account created successfully.",
    updatedToast: "Director account updated successfully."
  },
  office_user: {
    title: "Office Users",
    eyebrow: "User directory",
    description: "Create office user logins with the same web access level as directors.",
    readOnlyDescription: "Review office user accounts without changing account details.",
    createTitle: "Create Office User",
    displayPlaceholder: "Office user full name",
    usernamePlaceholder: "office-username",
    empty: "No office users have been created yet.",
    createdToast: "Office user account created successfully.",
    updatedToast: "Office user account updated successfully."
  }
};

const emptyEditForm = {
  id: "",
  displayName: "",
  username: "",
  password: "",
  active: true
};

export function UserManagementView({ canManage, role, showToast }) {
  const copy = ROLE_COPY[role];
  const [users, setUsers] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(emptyEditForm);

  async function loadUsers() {
    try {
      const payload = await request(`/admin/users?role=${role}`);
      setUsers(payload.users || []);
      setLoaded(true);
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  useEffect(() => {
    loadUsers();
  }, [role]);

  async function handleCreate(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await request("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          role,
          displayName: form.get("displayName"),
          username: form.get("username"),
          password: form.get("password")
        })
      });
      formElement.reset();
      showToast(copy.createdToast);
      await loadUsers();
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  function startEdit(user) {
    setEditing(user.id);
    setEditForm({
      id: user.id,
      displayName: user.displayName,
      username: user.username,
      password: "",
      active: user.active
    });
  }

  function cancelEdit() {
    setEditing(null);
    setEditForm(emptyEditForm);
  }

  async function saveEdit(event) {
    event.preventDefault();
    try {
      await request(`/admin/users/${encodeURIComponent(editForm.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          displayName: editForm.displayName,
          username: editForm.username,
          password: editForm.password || undefined,
          active: editForm.active
        })
      });
      cancelEdit();
      showToast(copy.updatedToast);
      await loadUsers();
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function toggleActive(user) {
    try {
      await request(`/admin/users/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !user.active })
      });
      showToast(`${user.displayName} ${user.active ? "deactivated" : "activated"}.`);
      await loadUsers();
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  return (
    <section className="view active-view management-view">
      <div className="view-heading hero-strip">
        <div>
          <span className="eyebrow">{copy.eyebrow}</span>
          <h2>{copy.title}</h2>
          <p>{canManage ? copy.description : copy.readOnlyDescription}</p>
        </div>
      </div>
      <section className={`management-layout ${canManage ? "" : "read-only-management"}`}>
        {canManage && (
          <form className="panel form-panel elevated-panel" onSubmit={handleCreate}>
            <h3>{copy.createTitle}</h3>
            <label>
              Display name
              <input name="displayName" placeholder={copy.displayPlaceholder} required />
            </label>
            <label>
              Username
              <input name="username" placeholder={copy.usernamePlaceholder} required />
            </label>
            <label>
              Password
              <input name="password" placeholder="Temporary password" type="password" required />
            </label>
            <button type="submit">Create account</button>
          </form>
        )}

        <section className="panel list-panel elevated-panel">
          <div className="panel-heading">
            <div>
              <h3>Created {copy.title}</h3>
              <p className="muted-text">
                {loaded ? `${users.length} account${users.length === 1 ? "" : "s"}` : "No accounts loaded"}
              </p>
            </div>
            <button className="ghost-button" type="button" onClick={loadUsers}>Refresh</button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Status</th>
                  {canManage && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={canManage ? 4 : 3}>{copy.empty}</td></tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.displayName}</td>
                      <td>{user.username}</td>
                      <td><span className={`status-pill ${user.active ? "active" : "inactive"}`}>{user.active ? "Active" : "Inactive"}</span></td>
                      {canManage && (
                        <td className="table-actions">
                          <button className="ghost-button table-button" type="button" onClick={() => startEdit(user)}>Edit</button>
                          <button className="ghost-button table-button" type="button" onClick={() => toggleActive(user)}>
                            {user.active ? "Deactivate" : "Activate"}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      {canManage && editing && (
        <section className="panel edit-panel elevated-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Edit account</span>
              <h3>{editForm.displayName}</h3>
            </div>
            <button className="ghost-button" type="button" onClick={cancelEdit}>Cancel</button>
          </div>
          <form className="edit-form" onSubmit={saveEdit}>
            <label>
              Display name
              <input
                value={editForm.displayName}
                onChange={(event) => setEditForm((value) => ({ ...value, displayName: event.target.value }))}
                required
              />
            </label>
            <label>
              Username
              <input
                value={editForm.username}
                onChange={(event) => setEditForm((value) => ({ ...value, username: event.target.value }))}
                required
              />
            </label>
            <label>
              New password
              <input
                value={editForm.password}
                placeholder="Leave blank to keep current password"
                type="password"
                onChange={(event) => setEditForm((value) => ({ ...value, password: event.target.value }))}
              />
            </label>
            <label className="switch-row">
              <input
                checked={editForm.active}
                type="checkbox"
                onChange={(event) => setEditForm((value) => ({ ...value, active: event.target.checked }))}
              />
              Active account
            </label>
            <button type="submit">Save changes</button>
          </form>
        </section>
      )}
    </section>
  );
}
