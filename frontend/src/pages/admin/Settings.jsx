import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Settings as SettingsIcon, Key, Globe, Shield, Save } from 'lucide-react';

const Settings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    providerApiKey: '',
    providerApiUrl: 'https://api.smmprovider.com/v2',
    siteName: 'YouTube & Social SMM Panel',
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.get('/admin/settings');
        if (res.data) {
          setFormData({
            providerApiKey: res.data.providerApiKey || '',
            providerApiUrl: res.data.providerApiUrl || 'https://api.smmprovider.com/v2',
            siteName: res.data.siteName || 'YouTube & Social SMM Panel',
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
      toast.success(res.data.message || 'API provider settings saved successfully!');
    } catch (error) {
      toast.error('Error saving API settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="glass-card rounded-3xl p-6 border border-gray-800 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <SettingsIcon className="w-6 h-6 text-accent-cyan" />
            External SMM Provider API Configuration
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Store your external SMM provider API keys and endpoints for automatic order forwarding.
          </p>
        </div>
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

          {/* Provider API URL */}
          <div>
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
              External SMM Provider Base API URL
            </label>
            <div className="relative">
              <Globe className="w-5 h-5 absolute left-3.5 top-3.5 text-gray-500" />
              <input
                type="url"
                required
                value={formData.providerApiUrl}
                onChange={(e) => setFormData({ ...formData, providerApiUrl: e.target.value })}
                placeholder="https://api.smmprovider.com/v2"
                className="w-full pl-11 pr-4 py-3 rounded-xl glass-input text-sm font-medium"
              />
            </div>
          </div>

          {/* Provider API Key */}
          <div>
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
              External Provider Secret API Key
            </label>
            <div className="relative">
              <Key className="w-5 h-5 absolute left-3.5 top-3.5 text-gray-500" />
              <input
                type="password"
                value={formData.providerApiKey}
                onChange={(e) => setFormData({ ...formData, providerApiKey: e.target.value })}
                placeholder="Enter API Key (e.g. smm_live_key_994818274)"
                className="w-full pl-11 pr-4 py-3 rounded-xl glass-input text-sm font-mono"
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
                <span>Save Provider Settings</span>
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
};

export default Settings;
