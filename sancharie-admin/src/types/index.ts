export type AdminRole = 'super_admin' | 'admin' | 'support';
export interface AdminUser { id: string; email: string; name: string; role: AdminRole; }
export interface PageResult<T> { success: boolean; data: T[]; pagination?: { page: number; limit: number; total: number; pages: number }; }
export interface DashboardData {
  totalUsers: number; newUsersToday: number; totalBookings: number; todayBookings: number;
  todayRevenue: number; monthlyRevenue: number; activeCoupons: number; activeDiscounts: number;
  activeTheme: string | null; cancelledBookings: number; pendingIssues: number;
  dailyBookings: { _id: string; bookings: number; revenue: number }[];
  dailyRegistrations: { _id: string; users: number }[];
  bookingStatuses: { _id: string; count: number }[];
  popularRoutes: { _id: { source: string; destination: string }; bookings: number }[];
  couponUsage: { _id: string; code: string; name: string; usageCount: number }[];
}
