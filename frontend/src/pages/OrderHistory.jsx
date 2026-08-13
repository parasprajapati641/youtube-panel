import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { History, Search, ExternalLink, AlertTriangle } from 'lucide-react';

const OrderHistory = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const fetchOrders = async () => {
    try {
      const res = await api.get('/orders/my-orders');
      setOrders(res.data);
    } catch (error) {
      toast.error('Failed to load order history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter((ord) => {
      const matchesStatus = statusFilter === 'All' || ord.status === statusFilter;
      const sName = ord.serviceId?.name || '';
      const pId = ord.providerOrderId || '';
      const errDet = ord.apiErrorDetails || '';
      const matchesSearch =
        ord._id.toLowerCase().includes(search.toLowerCase()) ||
        pId.toLowerCase().includes(search.toLowerCase()) ||
        errDet.toLowerCase().includes(search.toLowerCase()) ||
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

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="glass-card rounded-3xl p-6 border border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <History className="w-6 h-6 text-yt-red" />
            My Order History & Live Status
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Real-time status tracking with automated SMM Provider API integration.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search order or Ext ID..."
              className="pl-9 pr-4 py-2 rounded-xl glass-input text-xs font-medium w-44 sm:w-56"
            />
          </div>

          <div className="relative">
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
      </div>

      {/* Orders Table */}
      <div className="glass-card rounded-3xl p-6 border border-gray-800">
        {loading ? (
          <div className="py-12 text-center text-gray-500 text-sm">
            <div className="w-8 h-8 border-4 border-yt-red border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            Loading order records...
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
                  <th className="pb-3 px-3">Order ID / Ext ID</th>
                  <th className="pb-3 px-3">Service Name</th>
                  <th className="pb-3 px-3">Target Link</th>
                  <th className="pb-3 px-3">Quantity</th>
                  <th className="pb-3 px-3">Start Count</th>
                  <th className="pb-3 px-3">Remains</th>
                  <th className="pb-3 px-3">Cost</th>
                  <th className="pb-3 px-3">Status / API Note</th>
                  <th className="pb-3 px-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {filteredOrders.map((ord) => (
                  <tr key={ord._id} className="hover:bg-dark-700/30 transition-colors">
                    <td className="py-4 px-3">
                      <div className="font-mono text-xs font-bold text-white">#{ord._id.slice(-6)}</div>
                      {ord.providerOrderId ? (
                        <div className="font-mono text-[10px] text-accent-cyan mt-0.5">Ext: {ord.providerOrderId}</div>
                      ) : (
                        <div className="font-mono text-[10px] text-gray-500 mt-0.5">No Provider ID</div>
                      )}
                    </td>
                    <td className="py-4 px-3 font-medium text-white max-w-xs">
                      <div className="truncate font-semibold">{ord.serviceId?.name || 'Service Package'}</div>
                    </td>
                    <td className="py-4 px-3 text-xs text-accent-cyan max-w-xs truncate">
                      <a
                        href={ord.link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 hover:underline"
                      >
                        <span className="truncate max-w-[150px]">{ord.link}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
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
                      <div className="flex flex-col gap-1">
                        <span
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full border w-fit ${getStatusBadge(
                            ord.status
                          )}`}
                        >
                          {ord.status}
                        </span>
                        {ord.apiErrorDetails && (
                          <span className="text-[10px] font-medium text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 max-w-[160px] truncate flex items-center gap-1" title={ord.apiErrorDetails}>
                            <AlertTriangle className="w-3 h-3 shrink-0 text-red-400" />
                            {ord.apiErrorDetails}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-3 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(ord.createdAt).toLocaleDateString()}
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

export default OrderHistory;
