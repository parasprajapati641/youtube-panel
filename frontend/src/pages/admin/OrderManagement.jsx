import React, { useEffect, useState, useMemo } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { FileCheck, Search, ExternalLink, RefreshCw, Zap } from 'lucide-react';

const OrderManagement = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const fetchOrders = async () => {
    try {
      const res = await api.get('/admin/orders');
      setOrders(res.data);
    } catch (error) {
      toast.error('Failed to load system orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleForceSync = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/admin/orders/sync');
      toast.success(res.data.message || 'Live status sync completed!');
      fetchOrders();
    } catch (error) {
      toast.error('Failed to trigger live provider status sync');
    } finally {
      setSyncing(false);
    }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      const res = await api.put(`/admin/orders/${orderId}/status`, { status: newStatus });
      toast.success(res.data.message || `Order status updated to ${newStatus}`);
      fetchOrders();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update order status');
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((ord) => {
      const matchesStatus = statusFilter === 'All' || ord.status === statusFilter;
      const uName = ord.userId?.username || '';
      const sName = ord.serviceId?.name || '';
      const pId = ord.providerOrderId || '';
      const matchesSearch =
        ord._id.toLowerCase().includes(search.toLowerCase()) ||
        pId.toLowerCase().includes(search.toLowerCase()) ||
        uName.toLowerCase().includes(search.toLowerCase()) ||
        sName.toLowerCase().includes(search.toLowerCase()) ||
        ord.link.toLowerCase().includes(search.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [orders, search, statusFilter]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Completed':
        return 'bg-accent-emerald/15 text-accent-emerald border-accent-emerald/30';
      case 'In Progress':
        return 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30 animate-pulse';
      case 'Canceled':
      case 'Cancelled':
        return 'bg-red-500/15 text-red-400 border-red-500/30';
      default:
        return 'bg-accent-amber/15 text-accent-amber border-accent-amber/30';
    }
  };

  const handleRefill = async (orderId) => {
    try {
      const res = await api.post(`/admin/orders/${orderId}/refill`);
      toast.success(res.data.message || 'Refill request submitted successfully!');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Refill request failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card rounded-3xl p-6 border border-gray-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <FileCheck className="w-6 h-6 text-accent-cyan" />
            Global Order Monitoring & Live API Sync
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Monitor platform-wide orders, inspect Provider Order IDs, dispatch refills, and force live API status sync.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleForceSync}
            disabled={syncing}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-accent-purple to-accent-cyan text-white text-xs font-bold shadow-glow-cyan flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            <span>Force Live Status Sync</span>
          </button>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search user, Ext ID..."
              className="pl-9 pr-4 py-2 rounded-xl glass-input text-xs font-medium w-44"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl glass-input text-xs font-semibold cursor-pointer"
          >
            <option value="All" className="bg-dark-800">All Statuses</option>
            <option value="Pending" className="bg-dark-800">Pending</option>
            <option value="In Progress" className="bg-dark-800">In Progress</option>
            <option value="Completed" className="bg-dark-800">Completed</option>
            <option value="Canceled" className="bg-dark-800">Canceled</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="glass-card rounded-3xl p-6 border border-gray-800">
        {loading ? (
          <div className="py-12 text-center text-gray-500 text-sm">
            <div className="w-8 h-8 border-4 border-accent-cyan border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            Loading platform orders...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-sm">
            No matching orders found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="pb-3 px-3">Order / Provider ID</th>
                  <th className="pb-3 px-3">User</th>
                  <th className="pb-3 px-3">Service</th>
                  <th className="pb-3 px-3">Link</th>
                  <th className="pb-3 px-3">Qty</th>
                  <th className="pb-3 px-3">Start Count</th>
                  <th className="pb-3 px-3">Remains</th>
                  <th className="pb-3 px-3">Cost</th>
                  <th className="pb-3 px-3">Status Override</th>
                  <th className="pb-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {filteredOrders.map((ord) => (
                  <tr key={ord._id} className="hover:bg-dark-700/30 transition-colors">
                    <td className="py-4 px-3">
                      <div className="font-mono text-xs font-bold text-white">#{ord._id.slice(-6)}</div>
                      {ord.providerOrderId && (
                        <div className="font-mono text-[10px] text-accent-cyan mt-0.5">Ext: {ord.providerOrderId}</div>
                      )}
                    </td>
                    <td className="py-4 px-3">
                      <span className="font-bold text-white block">{ord.userId?.username || 'Unknown'}</span>
                      <span className="text-[11px] text-gray-400">{ord.userId?.email}</span>
                    </td>
                    <td className="py-4 px-3 font-medium text-white max-w-xs truncate">
                      {ord.serviceId?.name || 'Package'}
                    </td>
                    <td className="py-4 px-3 text-xs text-accent-cyan max-w-xs truncate">
                      <a href={ord.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                        <span className="truncate max-w-[120px]">{ord.link}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                    <td className="py-4 px-3 font-semibold text-gray-200">
                      {ord.quantity.toLocaleString()}
                    </td>
                    <td className="py-4 px-3 font-semibold text-gray-300">
                      {ord.startCount !== undefined ? ord.startCount.toLocaleString() : 0}
                    </td>
                    <td className="py-4 px-3 font-semibold text-accent-amber">
                      {ord.remains !== undefined ? ord.remains.toLocaleString() : 0}
                    </td>
                    <td className="py-4 px-3 font-bold text-accent-emerald">
                      ${ord.totalCost.toFixed(2)}
                    </td>
                    <td className="py-4 px-3">
                      <select
                        value={ord.status}
                        onChange={(e) => handleStatusChange(ord._id, e.target.value)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${getStatusBadge(
                          ord.status
                        )}`}
                      >
                        <option value="Pending" className="bg-dark-800 text-accent-amber">Pending</option>
                        <option value="In Progress" className="bg-dark-800 text-accent-cyan">In Progress</option>
                        <option value="Completed" className="bg-dark-800 text-accent-emerald">Completed</option>
                        <option value="Canceled" className="bg-dark-800 text-red-400">Canceled (Refund)</option>
                      </select>
                    </td>
                    <td className="py-4 px-3 text-right">
                      {ord.providerOrderId ? (
                        <button
                          onClick={() => handleRefill(ord._id)}
                          className="px-2.5 py-1 rounded-lg bg-accent-purple/15 text-accent-purple hover:bg-accent-purple/25 border border-accent-purple/30 text-xs font-bold transition-all flex items-center gap-1 ml-auto cursor-pointer"
                          title="Trigger Provider Refill"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>Refill</span>
                        </button>
                      ) : (
                        <span className="text-gray-600 text-xs">-</span>
                      )}
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

export default OrderManagement;
