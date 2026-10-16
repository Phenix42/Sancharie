import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './auth';
import AdminLayout from './layouts/AdminLayout';
import LoginPage from './pages/LoginPage';
import { AdminUsersPage, AuditPage, BookingsPage, DashboardPage, NotificationsPage, PaymentsPage, ResourceModule, SettingsPage, UsersPage, WalletsPage } from './pages';
import './styles/admin.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } });
function Protected({ children }: { children: React.ReactNode }) { const { admin, loading } = useAuth(); if (loading) return <div className="startup-loader"><div className="brand-mark">S</div><span>Securing your workspace…</span></div>; return admin ? <>{children}</> : <Navigate to="/login" replace />; }
function App() { return <AuthProvider><Routes><Route path="/login" element={<LoginPage/>}/><Route path="/" element={<Protected><AdminLayout/></Protected>}><Route index element={<DashboardPage/>}/><Route path="users" element={<UsersPage/>}/><Route path="wallets" element={<WalletsPage/>}/><Route path="bookings" element={<BookingsPage/>}/><Route path="discounts" element={<ResourceModule name="discounts"/>}/><Route path="coupons" element={<ResourceModule name="coupons"/>}/><Route path="offers" element={<ResourceModule name="offers"/>}/><Route path="themes" element={<ResourceModule name="themes"/>}/><Route path="banners" element={<ResourceModule name="banners"/>}/><Route path="notifications" element={<NotificationsPage/>}/><Route path="payments" element={<PaymentsPage/>}/><Route path="settings" element={<SettingsPage/>}/><Route path="admin-users" element={<AdminUsersPage/>}/><Route path="audit-logs" element={<AuditPage/>}/></Route><Route path="*" element={<Navigate to="/" replace/>}/></Routes></AuthProvider>; }

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><App/></BrowserRouter></QueryClientProvider></React.StrictMode>);
