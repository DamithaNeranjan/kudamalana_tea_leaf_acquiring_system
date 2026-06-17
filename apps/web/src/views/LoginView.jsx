import { useState } from "react";
import { request } from "../api/client.js";
import { logoUrl } from "../utils/format.js";

export function LoginView({ onLogin }) {
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("Checking login...");
    try {
      const login = await request("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password")
        })
      });
      if (!login.user) throw new Error("Login response did not include user details");
      setMessage("");
      onLogin(login.user);
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <main className="login-view">
      <section className="login-shell">
        <div className="login-copy">
          <div className="login-brand">
            <img className="brand-logo login-logo" src={logoUrl} alt="Kudamalana Tea Factory logo" />
            <span className="eyebrow">Director portal</span>
            <h2>Green leaf book access</h2>
            <p className="login-description">Sign in to review synced factory data and month-wise supplier payment totals.</p>
          </div>
          <div className="login-facts">
            <span>MySQL hosted records</span>
            <span>Director and admin roles</span>
            <span>Monthly payment views</span>
          </div>
        </div>

        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-card-heading">
            <span className="eyebrow">Welcome back</span>
            <h3>Portal Login</h3>
          </div>
          <label>
            Username
            <input name="username" placeholder="Enter username" autoComplete="username" required />
          </label>
          <label>
            Password
            <div className="password-field">
              <input
                name="password"
                placeholder="Enter password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
              />
              <button
                className="password-toggle"
                type="button"
                aria-pressed={showPassword}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          <button type="submit">Login</button>
          <span className="message" aria-live="polite">{message}</span>
        </form>
      </section>
    </main>
  );
}
