import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import StatCard from '../components/StatCard';
import { Wallet, ShoppingBag, DollarSign, PlusCircle, ArrowRight, History, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

const UserDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    balance: user?.balance || 0,
    isUnlimited: user?.isUnlimited || false,
    totalOrders: 0,
    totalSpent: 0,
  });
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [statsRes, ordersRes] = await Promise.all([
        api.get('/orders/stats'),
        api.get('/orders/my-orders'),
      ]);
      setStats(statsRes.data);
      setRecentOrders(ordersRes.data.slice(0, 5));
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Completed':
        return 'bg-accent-emerald/15 text-accent-emerald border-accent-emerald/30';
      case 'In Progress':
        return 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30 animate-pulse';
      case 'Cancelled':
        return 'bg-red-500/15 text-red-400 border-red-500/30';
      default:
        return 'bg-accent-amber/15 text-accent-amber border-accent-amber/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="glass-card rounded-3xl p-6 relative overflow-hidden bg-gradient-to-r from-yt-red/10 via-dark-800 to-dark-800 border border-gray-800">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Welcome back, <span className="text-yt-red">{user?.username}</span>!
              </h1>
              {user?.isUnlimited && (
                <span className="bg-accent-purple/20 border border-accent-purple/40 text-accent-cyan text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Testing Admin
                </span>
              )}
            </div>
            <p className="text-gray-400 text-sm">
              Boost your YouTube videos, subscribers, and social engagement instantly.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/new-order"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-yt-red to-yt-darkRed hover:from-yt-lightRed hover:to-yt-red text-white text-sm font-bold shadow-glow transition-all flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Place New Order</span>
            </Link>
            <Link
              to="/add-funds"
              className="px-4 py-2.5 rounded-xl bg-dark-700/80 hover:bg-dark-600 text-white text-sm font-semibold border border-gray-700 transition-all"
            >
              Add Funds
            </Link>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <StatCard
          title="Current Balance"
          value={user?.isUnlimited ? 'UNLIMITED' : `$${(stats.balance || 0).toFixed(2)}`}
          icon={Wallet}
          color="emerald"
          subtitle={user?.isUnlimited ? 'Infinite testing balance enabled' : 'Ready for orders'}
        />
        <StatCard
          title="Total Orders Placed"
          value={stats.totalOrders}
          icon={ShoppingBag}
          color="cyan"
          subtitle="Lifetime service requests"
        />
        <StatCard
          title="Total Spent"
          value={`$${(stats.totalSpent || 0).toFixed(2)}`}
          icon={DollarSign}
          color="purple"
          subtitle="Cumulative order value"
        />
      </div>

      {/* Recent Orders Section */}
      <div className="glass-card rounded-3xl p-6 border border-gray-800">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-yt-red" />
            <h2 className="text-lg font-bold text-white">Recent Orders</h2>
          </div>
          <Link
            to="/orders"
            className="text-xs font-bold text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
          >
            View All Orders <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-500 text-sm">Loading recent orders...</div>
        ) : recentOrders.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-sm flex flex-col items-center gap-3">
            <ShoppingBag className="w-10 h-10 text-gray-600 stroke-1" />
            <p>No orders placed yet. Start your first growth campaign now!</p>
            <Link
              to="/new-order"
              className="mt-1 px-4 py-2 rounded-xl bg-yt-red text-white text-xs font-bold shadow-glow"
            >
              New Order
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="pb-3 px-3">Order ID</th>
                  <th className="pb-3 px-3">Service</th>
                  <th className="pb-3 px-3">Target Link</th>
                  <th className="pb-3 px-3">Quantity</th>
                  <th className="pb-3 px-3">Cost</th>
                  <th className="pb-3 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {recentOrders.map((order) => (
                  <tr key={order._id} className="hover:bg-dark-700/30 transition-colors">
                    <td className="py-3.5 px-3 font-mono text-xs text-gray-400">
                      #{order._id.slice(-6)}
                    </td>
                    <td className="py-3.5 px-3 font-medium text-white max-w-xs truncate">
                      {order.serviceId?.name || 'Standard Service'}
                    </td>
                    <td className="py-3.5 px-3 text-xs text-accent-cyan max-w-xs truncate">
                      <a href={order.link} target="_blank" rel="noreferrer" className="hover:underline">
                        {order.link}
                      </a>
                    </td>
                    <td className="py-3.5 px-3 font-semibold text-gray-200">
                      {order.quantity.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-3 font-bold text-accent-emerald">
                      ${order.totalCost.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-3">
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${getStatusBadge(
                          order.status
                        )}`}
                      >
                        {order.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserDashboard;
