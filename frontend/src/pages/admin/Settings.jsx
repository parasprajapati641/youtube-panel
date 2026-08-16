import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Settings as SettingsIcon, Key, Globe, Shield, Save, Percent, RefreshCw } from 'lucide-react';

const Settings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [formData, setFormData] = useState({
    providerApiKey: '8678863199f629b7d2564662ec9d8f03',
    providerApiUrl: 'https://smmshiba.com/api/v2',
    siteName: 'YouTube & Social SMM Panel',
    defaultProfitMargin: 20,
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.get('/admin/settings');
        if (res.data) {
          setFormData({
            providerApiKey: res.data.providerApiKey || '8678863199f629b7d2564662ec9d8f03',
            providerApiUrl: res.data.providerApiUrl || 'https://smmshiba.com/api/v2',
            siteName: res.data.siteName || 'YouTube & Social SMM Panel',
            defaultProfitMargin: res.data.defaultProfitMargin !== undefined ? res.data.defaultProfitMargin : 20,
          });
        }
      } catch (error) {
        toast.error('Failed to load API settings');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.put('/admin/settings', formData);
      toast.success(res.data.message || 'SMMShiba Provider settings & profit margins saved!');
    } catch (error) {
      toast.error('Error saving API settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncServices = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/admin/services/sync-smmshiba');
      toast.success(res.data.message || 'SMMShiba service catalog synchronized!');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to sync SMMShiba catalog');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="glass-card rounded-3xl p-6 border border-gray-800 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <SettingsIcon className="w-6 h-6 text-accent-cyan" />
            SMMShiba API v2 Configuration & Profit Margin
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Configure SMMShiba API credentials, default profit markup percentage, and global panel settings.
          </p>
        </div>
        
        <button
          onClick={handleSyncServices}
          disabled={syncing}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-purple to-accent-cyan hover:from-purple-600 hover:to-cyan-500 text-white font-extrabold text-xs shadow-glow-cyan flex items-center gap-2 transition-all cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          <span>Sync SMMShiba Services</span>
        </button>
      </div>

      {loading ? (
        <div className="glass-card rounded-3xl p-12 text-center text-gray-500">
          <div className="w-8 h-8 border-4 border-accent-cyan border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          Loading provider settings...
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="glass-card rounded-3xl p-6 md:p-8 border border-gray-800 space-y-6">
          {/* Site Name */}
          <div>
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
              Panel Site Brand Name
            </label>
            <div className="relative">
              <Shield className="w-5 h-5 absolute left-3.5 top-3.5 text-gray-500" />
              <input
                type="text"
                required
                value={formData.siteName}
                onChange={(e) => setFormData({ ...formData, siteName: e.target.value })}
                className="w-full pl-11 pr-4 py-3 rounded-xl glass-input text-sm font-medium"
              />
            </div>
          </div>

          {/* SMMShiba API URL */}
          <div>
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
              SMMShiba Base API URL
            </label>
            <div className="relative">
              <Globe className="w-5 h-5 absolute left-3.5 top-3.5 text-gray-500" />
              <input
                type="url"
                required
                value={formData.providerApiUrl}
                onChange={(e) => setFormData({ ...formData, providerApiUrl: e.target.value })}
                placeholder="https://smmshiba.com/api/v2"
                className="w-full pl-11 pr-4 py-3 rounded-xl glass-input text-sm font-medium"
              />
            </div>
          </div>

          {/* SMMShiba API Key */}
          <div>
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
              SMMShiba Secret API Key
            </label>
            <div className="relative">
              <Key className="w-5 h-5 absolute left-3.5 top-3.5 text-gray-500" />
              <input
                type="password"
                value={formData.providerApiKey}
                onChange={(e) => setFormData({ ...formData, providerApiKey: e.target.value })}
                placeholder="8678863199f629b7d2564662ec9d8f03"
                className="w-full pl-11 pr-4 py-3 rounded-xl glass-input text-sm font-mono"
              />
            </div>
          </div>

          {/* Global Profit Margin Percentage */}
          <div>
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
              Global Profit Margin Percentage (%)
            </label>
            <p className="text-[11px] text-gray-400 mb-2">
              Formula: <code className="text-accent-cyan">client_price = provider_rate + (provider_rate * profit_margin %)</code>
            </p>
            <div className="relative">
              <Percent className="w-5 h-5 absolute left-3.5 top-3.5 text-gray-500" />
              <input
                type="number"
                min="0"
                step="0.1"
                required
                value={formData.defaultProfitMargin}
                onChange={(e) => setFormData({ ...formData, defaultProfitMargin: Number(e.target.value) })}
                placeholder="20"
                className="w-full pl-11 pr-4 py-3 rounded-xl glass-input text-sm font-bold text-accent-emerald"
              />
            </div>
          </div>

          {/* Save Button */}
          <button
            type="submit"
            disabled={saving}
            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-yt-red to-yt-darkRed hover:from-yt-lightRed hover:to-yt-red text-white font-extrabold text-sm uppercase tracking-wider shadow-glow transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {saving ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <Save className="w-5 h-5" />
                <span>Save Provider & Profit Margin Settings</span>
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
};

export default Settings;
