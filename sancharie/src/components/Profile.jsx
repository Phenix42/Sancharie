import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  Cake,
  Check,
  CheckCircle2,
  Compass,
  Edit3,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Header from './Header';
import Footer from './Footer';
import './Profile.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const decodeVapidKey = (key) => {
  const padded = `${key}${'='.repeat((4 - key.length % 4) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(padded);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
};

const getProfileForm = (user) => ({
  name: user?.name || '',
  email: user?.email || '',
  age: user?.age || '',
  gender: user?.gender || ''
});

export default function Profile() {
  const { user, token, updateProfile, isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState(getProfileForm());
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState('');
  const [referral, setReferral] = useState(null);
  const [referralMessage, setReferralMessage] = useState('');
  const profileDetailsRef = useRef(null);
  const supportsPush = typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate('/');
  }, [isAuthenticated, authLoading, navigate]);

  useEffect(() => {
    if (!supportsPush) return;
    navigator.serviceWorker.ready.then(async (registration) => {
      setPushEnabled(Boolean(await registration.pushManager.getSubscription()));
    }).catch(() => {});
  }, [supportsPush]);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE_URL}/user/referrals/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        const payload = await response.json();
        if (response.ok && payload.success) {
          setReferral(payload);
          if (payload.requiresProfileCompletion) {
            setIsEditing(true);
            window.requestAnimationFrame(() => profileDetailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
          }
        }
      })
      .catch(() => {});
  }, [token, user?.name]);

  const togglePushNotifications = async () => {
    setPushBusy(true);
    setPushMessage('');
    try {
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription();
      if (current) {
        const removed = await fetch(`${API_BASE_URL}/user/push/subscriptions`, {
          method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ endpoint: current.endpoint }),
        });
        if (!removed.ok) throw new Error((await removed.json()).message || 'Could not update notification settings');
        await current.unsubscribe();
        setPushEnabled(false);
        setPushMessage('Notifications turned off for this device.');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Allow notifications in your browser to turn them on.');
      const keyResponse = await fetch(`${API_BASE_URL}/user/push/public-key`);
      const keyData = await keyResponse.json();
      if (!keyResponse.ok || !keyData.publicKey) throw new Error(keyData.message || 'Notifications are not available right now.');
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(keyData.publicKey) });
      const saved = await fetch(`${API_BASE_URL}/user/push/subscriptions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subscription }),
      });
      if (!saved.ok) {
        await subscription.unsubscribe();
        throw new Error((await saved.json()).message || 'Could not save notification settings');
      }
      setPushEnabled(true);
      setPushMessage('Notifications enabled on this device.');
    } catch (pushError) {
      setPushMessage(pushError.message || 'Could not update notification settings.');
    } finally {
      setPushBusy(false);
    }
  };

  const shareReferralLink = async () => {
    if (!referral?.code) return;
    const shareUrl = `${window.location.origin}/?ref=${encodeURIComponent(referral.code)}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Travel with Sancharie', text: 'Join Sancharie with my invite. I earn a wallet reward after your first successful bus booking.', url: shareUrl });
      else { await navigator.clipboard.writeText(shareUrl); setReferralMessage('Your invite link is copied.'); }
    } catch (shareError) {
      if (shareError.name !== 'AbortError') setReferralMessage('Could not share the invite link. Please try again.');
    }
  };

  const completion = useMemo(() => {
    if (!user) return 0;
    const fields = [user.name, user.email, user.age, user.gender, user.phone];
    return Math.round((fields.filter(Boolean).length / fields.length) * 100);
  }, [user]);

  const displayName = user?.name || 'Sancharie Traveller';
  const firstName = displayName.split(' ')[0];

  const handleChange = (event) => {
    setFormData((current) => ({ ...current, [event.target.name]: event.target.value }));
    setError('');
    setSuccess('');
  };

  const handleEdit = () => {
    setFormData(getProfileForm(user));
    setError('');
    setSuccess('');
    setIsEditing(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.name.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!formData.age || Number(formData.age) < 1 || Number(formData.age) > 120) {
      setError('Please enter a valid age.');
      return;
    }
    if (!formData.gender) {
      setError('Please select your gender.');
      return;
    }

    setIsLoading(true);
    const result = await updateProfile(formData);
    setIsLoading(false);

    if (result.success) {
      setSuccess('Your profile is up to date.');
      setIsEditing(false);
    } else {
      setError(result.message || 'We could not update your profile. Please try again.');
    }
  };

  const handleCancel = () => {
    setFormData(getProfileForm(user));
    setIsEditing(false);
    setError('');
    setSuccess('');
  };

  if (authLoading) {
    return (
      <div className="profile-page">
        <Header />
        <main className="profile-loading" aria-live="polite">
          <span className="profile-loading-spinner" aria-hidden="true" />
          <p>Preparing your travel space...</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (!user) return null;

  const details = [
    { label: 'Full name', value: user.name || 'Not provided', icon: UserRound },
    { label: 'Email address', value: user.email || 'Not provided', icon: Mail },
    { label: 'Age', value: user.age ? `${user.age} years` : 'Not provided', icon: Cake },
    {
      label: 'Gender',
      value: user.gender ? user.gender.charAt(0).toUpperCase() + user.gender.slice(1) : 'Not provided',
      icon: UsersRound
    },
    { label: 'Phone number', value: `+91 ${user.phone}`, icon: Phone, verified: true }
  ];

  const quickActions = [
    {
      title: 'My bookings',
      description: 'View tickets and upcoming journeys',
      icon: CalendarDays,
      accent: 'gold',
      onClick: () => navigate('/my-bookings')
    },
    {
      title: 'My travellers',
      description: 'Manage your saved passengers',
      icon: UsersRound,
      accent: 'teal',
      onClick: () => navigate('/travellers')
    },
    {
      title: 'Explore trips',
      description: 'Find your next memorable escape',
      icon: Compass,
      accent: 'coral',
      onClick: () => navigate('/')
    }
  ];

  return (
    <div className="profile-page">
      <Header />

      <main className="profile-container">
        <header className="profile-page-heading">
          <div>
            <span className="profile-eyebrow"><Sparkles size={14} /> My travel space</span>
            <h1>Welcome back, {firstName}</h1>
            <p>Keep your details ready for quicker, smoother bookings.</p>
          </div>
          <div className="profile-heading-stamp" aria-hidden="true">
            <MapPin size={17} />
            Ready to roam
          </div>
        </header>

        <div className="profile-dashboard">
          <aside className="profile-identity-card">
            <div className="identity-decoration identity-decoration-one" aria-hidden="true" />
            <div className="identity-decoration identity-decoration-two" aria-hidden="true" />
            <div className="identity-route" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>

            <div className="profile-avatar-wrap">
              <div className="profile-avatar" aria-label={`${displayName}'s avatar`}>
                {displayName.charAt(0).toUpperCase()}
              </div>
              <span className="profile-online-dot" aria-hidden="true"><Check size={12} /></span>
            </div>

            <div className="profile-identity-copy">
              <p className="profile-kicker">Traveller profile</p>
              <h2>{displayName}</h2>
              <p className="profile-phone"><Phone size={14} /> +91 {user.phone}</p>
            </div>

            <div className="profile-completion-card">
              <div className="completion-heading">
                <div>
                  <span>Profile strength</span>
                  <strong>{completion === 100 ? 'All set!' : 'Almost there'}</strong>
                </div>
                <span className="completion-score">{completion}%</span>
              </div>
              <div
                className="completion-track"
                role="progressbar"
                aria-label="Profile completion"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={completion}
              >
                <span style={{ width: `${completion}%` }} />
              </div>
              <p>
                {completion === 100
                  ? 'Your details are ready for faster checkouts.'
                  : 'Add the missing details to speed up future bookings.'}
              </p>
            </div>

            <div className="profile-trust-note">
              <ShieldCheck size={18} />
              <div>
                <strong>Private & protected</strong>
                <span>Your details stay securely with you.</span>
              </div>
            </div>
          </aside>

          <section className="profile-content-card profile-details-card" aria-labelledby="personal-details-title" ref={profileDetailsRef}>
            <div className="profile-section-header">
              <div className="section-title-wrap">
                <span className="section-title-icon"><UserRound size={20} /></span>
                <div>
                  <p>Account details</p>
                  <h2 id="personal-details-title">Personal information</h2>
                </div>
              </div>

              {!isEditing && (
                <button className="profile-edit-btn" type="button" onClick={handleEdit}>
                  <Edit3 size={16} />
                  Edit profile
                </button>
              )}
            </div>

            {referral?.requiresProfileCompletion && (
              <div className="profile-alert" role="status">Save your profile details to unlock your referral offer and invite code.</div>
            )}

            {isEditing ? (
              <form className="profile-form" onSubmit={handleSubmit} noValidate>
                <div className="profile-form-grid">
                  <div className="profile-form-field">
                    <label htmlFor="profile-name">Full name <span>*</span></label>
                    <div className="profile-input-wrap">
                      <UserRound size={18} />
                      <input
                        id="profile-name"
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="Enter your full name"
                        autoComplete="name"
                      />
                    </div>
                  </div>

                  <div className="profile-form-field">
                    <label htmlFor="profile-email">Email address <span>*</span></label>
                    <div className="profile-input-wrap">
                      <Mail size={18} />
                      <input
                        id="profile-email"
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="you@example.com"
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className="profile-form-field">
                    <label htmlFor="profile-age">Age <span>*</span></label>
                    <div className="profile-input-wrap">
                      <Cake size={18} />
                      <input
                        id="profile-age"
                        type="number"
                        name="age"
                        value={formData.age}
                        onChange={handleChange}
                        placeholder="Your age"
                        min="1"
                        max="120"
                      />
                    </div>
                  </div>

                  <div className="profile-form-field">
                    <label htmlFor="profile-gender">Gender <span>*</span></label>
                    <div className="profile-input-wrap profile-select-wrap">
                      <UsersRound size={18} />
                      <select id="profile-gender" name="gender" value={formData.gender} onChange={handleChange}>
                        <option value="">Select gender</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div className="profile-form-field profile-phone-field">
                    <label htmlFor="profile-phone">Phone number</label>
                    <div className="profile-input-wrap is-disabled">
                      <Phone size={18} />
                      <input id="profile-phone" type="text" value={`+91 ${user.phone}`} disabled />
                      <span className="verified-chip"><Check size={12} /> Verified</span>
                    </div>
                    <small>Your verified number cannot be changed here.</small>
                  </div>
                </div>

                {error && <div className="profile-alert error" role="alert">{error}</div>}

                <div className="profile-form-actions">
                  <button type="button" className="profile-cancel-btn" onClick={handleCancel}>Cancel</button>
                  <button type="submit" className="profile-save-btn" disabled={isLoading}>
                    {isLoading ? <><span className="profile-btn-spinner" /> Saving...</> : <><Check size={17} /> Save changes</>}
                  </button>
                </div>
              </form>
            ) : (
              <div className="profile-details-grid">
                {details.map(({ label, value, icon: Icon, verified }, index) => (
                  <article className={`profile-detail-tile ${index === details.length - 1 ? 'profile-detail-wide' : ''}`} key={label}>
                    <span className="detail-icon">{createElement(Icon, { size: 19 })}</span>
                    <div>
                      <span className="detail-label">{label}</span>
                      <strong className={value === 'Not provided' ? 'is-empty' : ''}>{value}</strong>
                    </div>
                    {verified && <span className="verified-chip"><Check size={12} /> Verified</span>}
                  </article>
                ))}
              </div>
            )}

            {success && !isEditing && (
              <div className="profile-alert success" role="status">
                <CheckCircle2 size={17} /> {success}
              </div>
            )}
          </section>
        </div>

        <section className={`profile-content-card push-settings-card referral-card${referral?.requiresProfileCompletion ? ' is-incomplete' : ''}`} aria-labelledby="referral-title">
          <div className="profile-section-header">
            <div className="section-title-wrap">
              <span className="section-title-icon"><UsersRound size={20} /></span>
              <div><p>Bring your travel companions</p><h2 id="referral-title">Invite friends</h2></div>
            </div>
            <button className="profile-save-btn referral-share-btn" type="button" disabled={!referral?.code} onClick={() => void shareReferralLink()}><ArrowUpRight size={16} /> Share invite link</button>
          </div>
          {referral?.requiresProfileCompletion ? (
            <div className="referral-completion-prompt">
              <span className="referral-reward-badge">Referral reward</span>
              <p>Save your profile details to unlock your invite code and referral offer.</p>
              <button className="profile-save-btn referral-cta" type="button" onClick={() => { setIsEditing(true); profileDetailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>Complete profile <ArrowUpRight size={16} /></button>
            </div>
          ) : (
            <div className="referral-info-grid">
              <div className="referral-code-block">
                <span className="referral-label">Your invite code</span>
                <strong>{referral?.code || 'Loading…'}</strong>
                <small>Share your personal code with a friend.</small>
              </div>
              <div className="referral-reward-block">
                <span className="referral-reward-badge">{Number(referral?.rewardPercentage ?? 2)}% commission</span>
                <p>When your friend books their first successful bus ticket with Sancharie, you earn this percentage of the booking amount as wallet credit.</p>
                <small>{referral?.invited ?? 0} {referral?.invited === 1 ? 'friend' : 'friends'} joined</small>
              </div>
            </div>
          )}
          {referralMessage && <div className="profile-alert" role="status">{referralMessage}</div>}
        </section>

        <section className="profile-content-card push-settings-card" aria-labelledby="push-settings-title">
          <div className="profile-section-header">
            <div className="section-title-wrap">
              <span className="section-title-icon"><Bell size={20} /></span>
              <div><p>Stay up to date</p><h2 id="push-settings-title">App notifications</h2></div>
            </div>
            {supportsPush && <button className="profile-save-btn" type="button" disabled={pushBusy} onClick={() => void togglePushNotifications()}>
              {pushBusy ? 'Updating…' : pushEnabled ? 'Turn off' : 'Turn on'}
            </button>}
          </div>
          <p>Get offer announcements and updates about your bookings and refunds on this device.</p>
          {!supportsPush && <small>Push notifications are not supported in this browser or connection.</small>}
          {pushMessage && <div className="profile-alert" role="status">{pushMessage}</div>}
        </section>

        <section className="profile-quick-section" aria-labelledby="quick-actions-title">
          <div className="quick-section-heading">
            <div>
              <span>One tap away</span>
              <h2 id="quick-actions-title">Where would you like to go?</h2>
            </div>
            <p>Everything you need for your next journey.</p>
          </div>

          <div className="profile-actions-grid">
            {quickActions.map(({ title, description, icon: Icon, accent, onClick }) => (
              <button className={`profile-action-card ${accent}`} type="button" onClick={onClick} key={title}>
                <span className="action-icon">{createElement(Icon, { size: 22 })}</span>
                <span className="action-copy">
                  <strong>{title}</strong>
                  <small>{description}</small>
                </span>
                <span className="action-arrow"><ArrowUpRight size={18} /></span>
              </button>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
