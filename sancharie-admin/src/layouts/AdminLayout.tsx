import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Activity, BadgePercent, Banknote, Bell, BusFront, ChevronDown, CircleUserRound, ClipboardList, Gift, LayoutDashboard, LogOut, Megaphone, Settings2, Shield, TicketPercent, Users, WalletCards, type LucideIcon } from 'lucide-react';
import { useAuth } from '../auth';

const navigation: { label: string; path: string; icon: LucideIcon; roles?: string[] }[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard }, { label: 'Users', path: '/users', icon: Users }, { label: 'Bookings', path: '/bookings', icon: BusFront }, { label: 'Wallets', path: '/wallets', icon: WalletCards },
  { label: 'Discounts', path: '/discounts', icon: BadgePercent }, { label: 'Coupons', path: '/coupons', icon: TicketPercent }, { label: 'Offers', path: '/offers', icon: Gift },
  { label: 'Festival themes', path: '/themes', icon: Activity }, { label: 'Banners & CMS', path: '/banners', icon: Megaphone }, { label: 'Payments', path: '/payments', icon: Banknote },
  { label: 'Push notifications', path: '/notifications', icon: Bell, roles: ['super_admin', 'admin'] },
  { label: 'Settings', path: '/settings', icon: Settings2, roles: ['super_admin'] }, { label: 'Admin users', path: '/admin-users', icon: Shield, roles: ['super_admin'] },
  { label: 'Audit logs', path: '/audit-logs', icon: ClipboardList, roles: ['super_admin'] },
];

export default function AdminLayout() {
  const { admin, logout } = useAuth(); const navigate = useNavigate();
  const signOut = async () => { await logout(); navigate('/login', { replace: true }); };
  return <div className="admin-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark">S</div><div><strong>sancharie</strong><span>ADMIN CONTROL</span></div></div><div className="side-caption">WORKSPACE</div><nav>{navigation.filter((item) => !item.roles || item.roles.includes(admin?.role || '')).map((item) => { const Icon = item.icon; return <NavLink end={item.path === '/'} key={item.path} to={item.path} title={item.label} className={({ isActive }) => `nav-item ${isActive ? 'nav-active' : ''}`}><Icon size={18} strokeWidth={1.8}/><span>{item.label}</span></NavLink>; })}</nav><div className="sidebar-bottom"><div className="environment-chip"><span /> Live operations</div><button className="nav-item logout-button" onClick={() => void signOut()}><LogOut size={18}/><span>Sign out</span></button></div></aside>
    <main className="main-shell"><header className="topbar"><div className="mobile-brand"><div className="brand-mark">S</div><strong>Sancharie Admin</strong></div><div className="topbar-right"><span className="secure-chip"><Shield size={14}/> Secure admin</span><div className="admin-identity"><div className="avatar"><CircleUserRound size={17}/></div><div><strong>{admin?.name}</strong><small>{admin?.role?.replace('_', ' ')}</small></div><ChevronDown size={14}/></div></div></header><div className="page-container"><Outlet /></div><footer className="app-footer">Sancharie Admin <span>·</span> Role-based access enabled</footer></main></div>;
}
