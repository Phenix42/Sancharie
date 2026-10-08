import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth';
import { errorMessage } from '../api/client';

export default function LoginPage() {
  const { admin, login, loading } = useAuth(); const navigate = useNavigate();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  if (admin) return <Navigate to="/" replace />;
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setError(''); setBusy(true); try { await login(email, password); navigate('/', { replace: true }); } catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); } };
  return <main className="login-page"><div className="login-decoration"><div className="login-orb orb-one"/><div className="login-orb orb-two"/><div className="login-brand"><div className="brand-mark">S</div><span>SANCHARIE <i>ADMIN</i></span></div><div className="login-message"><span className="eyebrow">OPERATIONS, MADE CLEAR</span><h1>Your platform.<br/>Under control.</h1><p>Manage bookings, customers and the live Sancharie experience from one secure workspace.</p></div><div className="login-footnote"><ShieldCheck size={16}/> Authorized administrators only</div></div><div className="login-main"><form className="login-card" onSubmit={(e) => void submit(e)}><div className="login-icon"><ShieldCheck size={22}/></div><span className="eyebrow">ADMIN PORTAL</span><h2>Welcome back</h2><p>Sign in with your administrator account.</p>{error && <div className="inline-error">{error}</div>}<label className="form-field"><span>Email address</span><input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@sancharie.com" /></label><label className="form-field"><span>Password</span><input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" /></label><button className="button button-primary login-submit" disabled={busy || loading}>{busy ? 'Signing in…' : <>Sign in securely <ArrowRight size={17}/></>}</button><small className="login-security">Your admin session expires automatically and can be revoked.</small></form></div></main>;
}
