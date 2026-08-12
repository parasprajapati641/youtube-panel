import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Globe, Plus, Edit2, Trash2, Key, DollarSign, RefreshCw, Save, X, ShieldCheck } from 'lucide-react';

const ProviderManagement = () => {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    apiUrl: '',
    apiKey: '',
    status: 'active',
  });

  const fetchProviders = async () => {
    try {
      const res = await api.get('/admin/providers');
      setProviders(res.data);
    } catch (error) {
      toast.error('Failed to load API providers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  const handleOpenAddModal = () => {
    setEditingProvider(null);
    setFormData({
      name: '',
      apiUrl: 'https://api.smmprovider.com/v2',
      apiKey: '',
      status: 'active',
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (p) => {
    setEditingProvider(p);
    setFormData({
      name: p.name,
      apiUrl: p.apiUrl,
      apiKey: p.apiKey,
      status: p.status,
    });
    setIsModalOpen(true);
  };

  const handleSubmitModal = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.apiUrl || !formData.apiKey) {
      toast.error('Name, API URL, and API Key are required');
      return;
    }

    try {
      if (editingProvider) {
        await api.put(`/admin/providers/${editingProvider._id}`, formData);
        toast.success('API Provider updated successfully');
      } else {
        await api.post('/admin/providers', formData);
        toast.success('New SMM API Provider added');
      }
      setIsModalOpen(false);
      fetchProviders();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error saving provider');
    }
  };

  const handleDeleteProvider = async (id) => {
    if (!window.confirm('Delete this API provider configuration?')) return;
    try {
      await api.delete(`/admin/providers/${id}`);
      toast.success('Provider deleted');
      fetchProviders();
    } catch (error) {
      toast.error('Error deleting provider');
    }
  };

  const handleCheckBalance = async (id) => {
    try {
      const res = await api.post(`/admin/providers/${id}/balance`);
      toast.success(`Provider Balance: $${(res.data.balance || 0).toFixed(2)}`);
      fetchProviders();
    } catch (error) {
      toast.error('Failed to query provider balance');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card rounded-3xl p-6 border border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Globe className="w-6 h-6 text-accent-cyan" />
            SMM API v2 Provider Integration
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Connect external SMM Provider APIs (e.g. JapSMM / Peakerr API v2) for automatic order routing.
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-accent-cyan to-blue-600 hover:from-cyan-400 hover:to-accent-cyan text-dark-900 text-xs font-extrabold shadow-glow-cyan transition-all flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Provider</span>
        </button>
      </div>

      {/* Providers Table */}
      <div className="glass-card rounded-3xl p-6 border border-gray-800">
        {loading ? (
          <div className="py-12 text-center text-gray-500 text-sm">
            <div className="w-8 h-8 border-4 border-accent-cyan border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            Loading API providers...
          </div>
        ) : providers.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-sm">
            No SMM API providers configured yet. Click "Add New Provider" to connect your first API.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="pb-3 px-3">Provider Name</th>
                  <th className="pb-3 px-3">API Endpoint URL</th>
                  <th className="pb-3 px-3">API Key</th>
                  <th className="pb-3 px-3">API Balance</th>
                  <th className="pb-3 px-3">Status</th>
                  <th className="pb-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {providers.map((p) => (
                  <tr key={p._id} className="hover:bg-dark-700/30 transition-colors">
                    <td className="py-4 px-3 font-bold text-white">
                      {p.name}
                    </td>
                    <td className="py-4 px-3 font-mono text-xs text-accent-cyan max-w-xs truncate">
                      {p.apiUrl}
                    </td>
                    <td className="py-4 px-3 font-mono text-xs text-gray-400">
                      ••••••••{p.apiKey?.slice(-4)}
                    </td>
                    <td className="py-4 px-3 font-bold text-accent-emerald">
                      ${(p.balance || 0).toFixed(2)}
                    </td>
                    <td className="py-4 px-3">
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                          p.status === 'active'
                            ? 'bg-accent-emerald/15 text-accent-emerald border-accent-emerald/30'
                            : 'bg-gray-800 text-gray-500 border-gray-700'
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="py-4 px-3 text-right space-x-2">
                      <button
                        onClick={() => handleCheckBalance(p._id)}
                        className="p-1.5 rounded-lg bg-dark-700 text-accent-cyan hover:bg-dark-600 border border-gray-700 transition-all"
                        title="Query Live API Balance"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleOpenEditModal(p)}
                        className="p-1.5 rounded-lg bg-dark-700 text-gray-300 hover:text-white border border-gray-700 transition-all"
                        title="Edit Provider"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteProvider(p._id)}
                        className="p-1.5 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 transition-all"
                        title="Delete Provider"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Provider Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-card rounded-3xl p-6 border border-gray-800 space-y-5 relative">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="text-lg font-bold text-white">
                {editingProvider ? 'Edit API Provider' : 'Add SMM API v2 Provider'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitModal} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-1">Provider Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. JapSMM Main Provider"
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-1">API Endpoint URL</label>
                <input
                  type="url"
                  required
                  value={formData.apiUrl}
                  onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })}
                  placeholder="https://api.smmprovider.com/v2"
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-1">API Key</label>
                <input
                  type="password"
                  required
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  placeholder="smm_live_api_key_88992"
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-semibold"
                >
                  <option value="active" className="bg-dark-800">Active</option>
                  <option value="inactive" className="bg-dark-800">Inactive</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-gradient-to-r from-accent-cyan to-blue-600 text-dark-900 font-extrabold text-sm shadow-glow-cyan flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Save Provider Credentials</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProviderManagement;
