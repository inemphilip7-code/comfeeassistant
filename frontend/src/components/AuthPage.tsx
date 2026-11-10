import React, { FormEvent, useState } from 'react';
import { API_BASE_URL } from '../services/api';

type AuthMode = 'login' | 'register';

interface AuthPageProps {
  initialMode?: AuthMode;
}

/** Public login/registration entry point. Registration uses the backend's explicit
 * /api/auth/register endpoint; it never silently claims an existing email address. */
export function AuthPage({ initialMode = 'login' }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          ...(mode === 'register' ? { fullName: fullName.trim() } : {})
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || data?.error || `Request failed (HTTP ${response.status}).`);
      }
      if (!data?.token) {
        throw new Error('The server did not return a sign-in token. Please try again.');
      }

      // Reload the app so the API module initializes with the newly issued token.
      localStorage.setItem('comfee_auth_token', data.token);
      window.location.replace('/');
    } catch (requestError: any) {
      setError(
        requestError instanceof TypeError
          ? 'Could not reach the server. Check your connection and try again.'
          : requestError?.message || 'Sign-in failed. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mainContent">
      <section className="card" style={{ maxWidth: 460, margin: '0 auto' }}>
        <h2>{mode === 'register' ? 'Create your clinician account' : 'Secure clinician access'}</h2>
        <p className="hint">
          {mode === 'register'
            ? 'Create an account to start using the clinical documentation assistant.'
            : 'AI-assisted clinical documentation for healthcare professionals.'}
        </p>

        {error && <div className="warningBanner" role="alert">{error}</div>}

        <form onSubmit={submit} className="form">
          {mode === 'register' && (
            <>
              <label className="label" htmlFor="signup-full-name">Full name</label>
              <input
                id="signup-full-name"
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="input"
                autoComplete="name"
                maxLength={120}
                required
              />
            </>
          )}
          <label className="label" htmlFor="auth-email">Clinician email</label>
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="input"
            autoComplete="email"
            required
          />
          <label className="label" htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="input"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            minLength={mode === 'register' ? 8 : undefined}
            required
          />
          {mode === 'register' && (
            <p className="hint" style={{ margin: 0 }}>Use at least 8 characters.</p>
          )}
          <button type="submit" className="primaryButton" disabled={submitting}>
            {submitting
              ? (mode === 'register' ? 'Creating account…' : 'Signing in…')
              : (mode === 'register' ? 'Create account' : 'Sign in')}
          </button>
        </form>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <button
            type="button"
            className="linkButton"
            onClick={() => {
              setError(null);
              setMode(mode === 'login' ? 'register' : 'login');
            }}
          >
            {mode === 'register' ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </button>
        </div>
        {mode === 'login' && (
          <div style={{ marginTop: 8, textAlign: 'center' }}>
            <a className="linkButton" href="/?legacyAuth=1">Forgot password?</a>
          </div>
        )}
      </section>
    </main>
  );
}
