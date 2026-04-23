import { FormEvent, useState } from 'react';
import { login, register } from '../lib/api';

interface LoginPageProps {
  onSuccess: (token: string, user: { id: number; email: string }) => void;
}

export default function LoginPage({ onSuccess }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const result = isRegister ? await register(email, password) : await login(email, password);
      onSuccess(result.token, result.user);
      setEmail('');
      setPassword('');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuthLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>RSS-reader</h1>
        <p className="eyebrow">Local intelligence reader</p>
        {authError ? <div className="notice">{authError}</div> : null}
        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              minLength={isRegister ? 6 : 1}
              required
            />
          </label>
          <button className="primary" disabled={authLoading}>
            {isRegister ? 'Register' : 'Login'}
          </button>
          <button type="button" onClick={() => setIsRegister(!isRegister)}>
            {isRegister ? 'Already have an account? Login' : 'Need an account? Register'}
          </button>
        </form>
      </div>
    </div>
  );
}
