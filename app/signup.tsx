"use client";

import { type FormEvent, useState } from "react";
import { ArrowLeft, Eye, EyeOff, Loader2, Mail, CheckCircle, AlertCircle } from "lucide-react";

type FormStatus = "idle" | "submitting" | "success" | "error";

export default function SignupPage({ navigate }: { navigate: (path: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function validate(): string | null {
    if (!email.trim()) return "Email is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Please enter a valid email address.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (password !== confirmPassword) return "Passwords do not match.";
    return null;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setErrorMsg(validationError);
      setStatus("error");
      return;
    }
    setStatus("submitting");
    setErrorMsg("");

    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Simulated success (no real backend)
    setStatus("success");
  }

  function handleGoogleOAuth() {
    setStatus("submitting");
    setErrorMsg("");

    // Simulate OAuth redirect delay
    setTimeout(() => {
      setStatus("success");
    }, 2000);
  }

  if (status === "success") {
    return (
      <div className="signup-page">
        <div className="signup-card">
          <div className="signup-success">
            <div className="signup-success-icon">
              <CheckCircle size={48} />
            </div>
            <h2>Account created!</h2>
            <p>Welcome to MILO. You can now explore and manage your resource library.</p>
            <button className="signup-button signup-button--primary" onClick={() => navigate("/")}>
              Go to Dashboard
            </button>
          </div>
        </div>

        <style>{`
          .signup-page {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
          }
          .signup-card {
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 1rem;
            padding: 2.5rem;
            width: 100%;
            max-width: 420px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          }
          .signup-success {
            text-align: center;
          }
          .signup-success-icon {
            color: #22c55e;
            margin-bottom: 1rem;
          }
          .signup-success h2 {
            color: #f1f5f9;
            font-size: 1.5rem;
            font-weight: 600;
            margin: 0 0 0.5rem;
          }
          .signup-success p {
            color: #94a3b8;
            margin: 0 0 1.5rem;
            line-height: 1.5;
          }
          .signup-button--primary {
            background: #3b82f6;
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 0.5rem;
            font-size: 0.95rem;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
          }
          .signup-button--primary:hover {
            background: #2563eb;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="signup-page">
      <div className="signup-card">
        <div className="signup-header">
          <button
            className="signup-back"
            onClick={() => navigate("/")}
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="signup-logo">
            <Mail size={24} />
          </div>
          <h1>Create your account</h1>
          <p className="signup-subtitle">
            Join MILO to build your personal resource library.
          </p>
        </div>

        {/* Google OAuth */}
        <button
          className="signup-oauth"
          onClick={handleGoogleOAuth}
          disabled={status === "submitting"}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <span>Sign up with Google</span>
        </button>

        <div className="signup-divider">
          <span>or</span>
        </div>

        {/* Email/Password Form */}
        <form className="signup-form" onSubmit={handleSubmit}>
          <div className="signup-field">
            <label htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setStatus("idle"); }}
              required
              autoComplete="email"
              disabled={status === "submitting"}
            />
          </div>

          <div className="signup-field">
            <label htmlFor="signup-password">Password</label>
            <div className="signup-input-wrapper">
              <input
                id="signup-password"
                type={showPassword ? "text" : "password"}
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setStatus("idle"); }}
                required
                minLength={8}
                autoComplete="new-password"
                disabled={status === "submitting"}
              />
              <button
                type="button"
                className="signup-toggle-vis"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="signup-field">
            <label htmlFor="signup-confirm">Confirm password</label>
            <div className="signup-input-wrapper">
              <input
                id="signup-confirm"
                type={showConfirm ? "text" : "password"}
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setStatus("idle"); }}
                required
                minLength={8}
                autoComplete="new-password"
                disabled={status === "submitting"}
              />
              <button
                type="button"
                className="signup-toggle-vis"
                onClick={() => setShowConfirm(!showConfirm)}
                aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="signup-error" role="alert">
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            className="signup-button signup-button--primary signup-button--full"
            disabled={status === "submitting"}
          >
            {status === "submitting" ? (
              <>
                <Loader2 size={18} className="signup-spinner" />
                Creating account…
              </>
            ) : (
              "Create account"
            )}
          </button>
        </form>

        <p className="signup-footer">
          Already have an account?{" "}
          <button className="signup-link" onClick={() => navigate("/")}>
            Sign in
          </button>
        </p>
      </div>

      <style>{`
        .signup-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
        }
        .signup-card {
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 1rem;
          padding: 2.5rem;
          width: 100%;
          max-width: 420px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }
        .signup-header {
          text-align: center;
          margin-bottom: 1.5rem;
          position: relative;
        }
        .signup-back {
          position: absolute;
          left: 0;
          top: 0;
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 0.25rem;
          border-radius: 0.375rem;
          transition: color 0.2s;
        }
        .signup-back:hover {
          color: #f1f5f9;
        }
        .signup-logo {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          border-radius: 12px;
          color: white;
          margin-bottom: 1rem;
        }
        .signup-header h1 {
          color: #f1f5f9;
          font-size: 1.5rem;
          font-weight: 600;
          margin: 0 0 0.375rem;
        }
        .signup-subtitle {
          color: #64748b;
          margin: 0;
          font-size: 0.9rem;
        }
        .signup-oauth {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          width: 100%;
          padding: 0.75rem;
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 0.5rem;
          color: #e2e8f0;
          font-size: 0.95rem;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s;
          margin-bottom: 1rem;
        }
        .signup-oauth:hover:not(:disabled) {
          background: #1e293b;
          border-color: #475569;
        }
        .signup-oauth:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .signup-divider {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1.25rem;
          color: #475569;
          font-size: 0.85rem;
        }
        .signup-divider::before,
        .signup-divider::after {
          content: "";
          flex: 1;
          height: 1px;
          background: #334155;
        }
        .signup-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .signup-field {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }
        .signup-field label {
          color: #94a3b8;
          font-size: 0.85rem;
          font-weight: 500;
        }
        .signup-input-wrapper {
          position: relative;
        }
        .signup-input-wrapper input {
          width: 100%;
          padding: 0.7rem 2.5rem 0.7rem 0.75rem;
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 0.5rem;
          color: #f1f5f9;
          font-size: 0.95rem;
          outline: none;
          transition: border-color 0.2s;
          box-sizing: border-box;
        }
        .signup-input-wrapper input:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
        }
        .signup-input-wrapper input::placeholder {
          color: #475569;
        }
        .signup-input-wrapper input:disabled {
          opacity: 0.6;
        }
        .signup-toggle-vis {
          position: absolute;
          right: 0.5rem;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: #64748b;
          cursor: pointer;
          padding: 0.25rem;
          display: flex;
          transition: color 0.2s;
        }
        .signup-toggle-vis:hover {
          color: #94a3b8;
        }
        .signup-error {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.625rem 0.75rem;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.25);
          border-radius: 0.5rem;
          color: #fca5a5;
          font-size: 0.875rem;
        }
        .signup-error svg {
          flex-shrink: 0;
        }
        .signup-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }
        .signup-button--full {
          width: 100%;
        }
        .signup-spinner {
          animation: signup-spin 0.8s linear infinite;
        }
        @keyframes signup-spin {
          to { transform: rotate(360deg); }
        }
        .signup-footer {
          text-align: center;
          color: #64748b;
          font-size: 0.85rem;
          margin: 1.25rem 0 0;
        }
        .signup-link {
          background: none;
          border: none;
          color: #3b82f6;
          cursor: pointer;
          font-size: 0.85rem;
          padding: 0;
          text-decoration: underline;
          transition: color 0.2s;
        }
        .signup-link:hover {
          color: #60a5fa;
        }

        /* Mobile-responsive adjustments */
        @media (max-width: 480px) {
          .signup-card {
            padding: 1.5rem;
            border-radius: 0.75rem;
          }
          .signup-header h1 {
            font-size: 1.25rem;
          }
          .signup-oauth {
            font-size: 0.875rem;
            padding: 0.625rem;
          }
          .signup-input-wrapper input {
            font-size: 16px; /* prevent iOS zoom */
          }
        }
      `}</style>
    </div>
  );
}