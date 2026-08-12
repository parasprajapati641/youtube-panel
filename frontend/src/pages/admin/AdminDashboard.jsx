import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import StatCard from '../../components/StatCard';
import { Users, ShoppingBag, DollarSign, Wallet, ShieldCheck, Layers, FileCheck, Settings, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalOrders: 0,
    totalRevenue: 0,
    systemBalance: 0,
    statusBreakdown: { pending: 0, inProgress: 0, completed: 0, cancelled: 0 },
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAdminStats = async () => {
      try {
        const res = await api.get('/admin/stats');
        setStats(res.data);
      } catch (error) {
        console.error('Error fetching admin stats:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchAdminStats();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="glass-card rounded-3xl p-6 relative overflow-hidden bg-gradient-to-r from-yt-red/15 via-dark-800 to-dark-800 border border-yt-red/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-yt-red" />
              <h1 className="text-2xl font-extrabold text-white tracking-tight">
                Super Admin Control Center
              </h1>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Platform administration, user management, service pricing, and order overrides.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/admin/users"
              className="px-3.5 py-2 rounded-xl bg-dark-700 hover:bg-dark-600 border border-gray-700 text-xs font-bold text-white transition-all"
            >
              Users
            </Link>
            <Link
              to="/admin/services"
              className="px-3.5 py-2 rounded-xl bg-dark-700 hover:bg-dark-600 border border-gray-700 text-xs font-bold text-white transition-all"
            >
              Services
            </Link>
            <Link
              to="/admin/orders"
              className="px-3.5 py-2 rounded-xl bg-yt-red hover:bg-yt-darkRed text-xs font-bold text-white shadow-glow transition-all"
            >
              Orders
            </Link>
          </div>
        </div>
      </div>

      {/* Main Admin Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Total Users"
          value={loading ? '...' : stats.totalUsers}
          icon={Users}
          color="cyan"
          subtitle="Registered panel accounts"
        />
        <StatCard
          title="Total Orders"
          value={loading ? '...' : stats.totalOrders}
          icon={ShoppingBag}
          color="amber"
          subtitle="Submitted service orders"
        />
        <StatCard
          title="Total Revenue"
          value={loading ? '...' : `$${stats.totalRevenue.toFixed(2)}`}
          icon={DollarSign}
          color="emerald"
          subtitle="Non-cancelled order value"
        />
        <StatCard
          title="System Balance"
          value={loading ? '...' : `$${stats.systemBalance.toFixed(2)}`}
          icon={Wallet}
          color="purple"
          subtitle="User account balances"
        />
      </div>

      {/* Order Status Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card rounded-3xl p-6 border border-gray-800 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-accent-cyan" />
            Order Status Breakdown
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-accent-amber/10 border border-accent-amber/30 text-center">
              <span className="text-xs uppercase font-bold text-accent-amber block">Pending</span>
              <span className="text-2xl font-extrabold text-white mt-1 block">
                {stats.statusBreakdown.pending}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-accent-cyan/10 border border-accent-cyan/30 text-center">
              <span className="text-xs uppercase font-bold text-accent-cyan block">In Progress</span>
              <span className="text-2xl font-extrabold text-white mt-1 block">
                {stats.statusBreakdown.inProgress}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-accent-emerald/10 border border-accent-emerald/30 text-center">
              <span className="text-xs uppercase font-bold text-accent-emerald block">Completed</span>
              <span className="text-2xl font-extrabold text-white mt-1 block">
                {stats.statusBreakdown.completed}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-center">
              <span className="text-xs uppercase font-bold text-red-400 block">Cancelled</span>
              <span className="text-2xl font-extrabold text-white mt-1 block">
                {stats.statusBreakdown.cancelled}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Admin Actions */}
        <div className="glass-card rounded-3xl p-6 border border-gray-800 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-yt-red" />
            Quick Admin Management
          </h2>

          <div className="flex flex-col gap-3">
            <Link
              to="/admin/users"
              className="p-4 rounded-2xl bg-dark-800/80 border border-gray-800 hover:border-gray-700 flex items-center justify-between group transition-all"
            >
              <div>
                <span className="text-sm font-bold text-white block">User Management</span>
                <span className="text-xs text-gray-400">Edit balance, toggle unlimited mode, block accounts</span>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-yt-red group-hover:translate-x-1 transition-all" />
            </Link>

            <Link
              to="/admin/services"
              className="p-4 rounded-2xl bg-dark-800/80 border border-gray-800 hover:border-gray-700 flex items-center justify-between group transition-all"
            >
              <div>
                <span className="text-sm font-bold text-white block">Services & Pricing</span>
                <span className="text-xs text-gray-400">Add YouTube Views, Subscribers, Likes & rates</span>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-yt-red group-hover:translate-x-1 transition-all" />
            </Link>

            <Link
              to="/admin/settings"
              className="p-4 rounded-2xl bg-dark-800/80 border border-gray-800 hover:border-gray-700 flex items-center justify-between group transition-all"
            >
              <div>
                <span className="text-sm font-bold text-white block">API Provider Keys</span>
                <span className="text-xs text-gray-400">Configure external SMM Provider API keys</span>
              </div>
              <Settings className="w-4 h-4 text-gray-500 group-hover:text-accent-cyan transition-colors" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
