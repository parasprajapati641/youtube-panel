import React, { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  Bot,
  Plus,
  RefreshCw,
  Trash2,
  Loader2,
  Youtube,
  Cookie,
  Clock,
  Upload,
  FileText,
} from 'lucide-react';

const BotManagement = () => {
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [botName, setBotName] = useState('');
  const [registering, setRegistering] = useState(false);
  const [busyName, setBusyName] = useState(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState(null);

  const fetchBots = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/bot/list');
      if (data.success) setBots(data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load bots');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBots();
  }, [fetchBots]);

  const handleRegister = async (e) => {
    e.preventDefault();
    const name = botName.trim();
    if (name.length < 2) {
      toast.error('Bot name min 2 characters');
      return;
    }
    setRegistering(true);
    const toastId = toast.loading(
      `Registering "${name}"… Browser open thase – YouTube login kari ne complete karo`
    );
    try {
      const { data } = await api.post('/bot/register', { botName: name });
      if (data.success) {
        toast.success(data.message || `Bot "${name}" registered`, { id: toastId });
        setBotName('');
        fetchBots();
      } else {
        toast.error(data.message || 'Register failed', { id: toastId });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Register failed', {
        id: toastId,
      });
    } finally {
      setRegistering(false);
    }
  };

  const handleCsvFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    if (!text.trim()) {
      toast.error('Empty CSV file');
      return;
    }
    setCsvUploading(true);
    setCsvResult(null);
    const toastId = toast.loading('CSV register chaloo… each account login thayse');
    try {
      const { data } = await api.post('/bot/register-csv', { csv: text }, { timeout: 0 });
      if (data.success) {
        toast.success(data.message, { id: toastId });
        setCsvResult(data.data);
        fetchBots();
      } else {
        toast.error(data.message || 'CSV failed', { id: toastId });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'CSV register failed', {
        id: toastId,
      });
    } finally {
      setCsvUploading(false);
      e.target.value = '';
    }
  };

  const handleRefresh = async (name) => {
    setBusyName(name);
    const toastId = toast.loading(`Refreshing "${name}"… Browser open thase`);
    try {
      const { data } = await api.post(`/bot/refresh/${encodeURIComponent(name)}`);
      toast.success(data.message || 'Refreshed', { id: toastId });
      fetchBots();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Refresh failed', { id: toastId });
    } finally {
      setBusyName(null);
    }
  };

  const handleDelete = async (name) => {
    if (!window.confirm(`Delete bot "${name}"? Profile + cookies remove thase.`)) return;
    setBusyName(name);
    try {
      const { data } = await api.delete(`/bot/${encodeURIComponent(name)}`);
      toast.success(data.message || 'Deleted');
      fetchBots();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    } finally {
      setBusyName(null);
    }
  };

  const fmt = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString();
    } catch {
      return '—';
    }
  };

  return (
    <div className="space-y-6 w-full max-w-full">
      <div className="glass-card rounded-3xl p-6 border border-gray-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
              <Bot className="w-7 h-7 text-yt-red" />
              YouTube Bots
            </h1>
            <p className="text-xs text-gray-400 mt-1 max-w-xl">
              Manual register (browser login) or bulk register via CSV (email, password).
            </p>
          </div>
          <button
            type="button"
            onClick={fetchBots}
            disabled={loading}
            className="px-3 py-2 rounded-xl bg-dark-700 hover:bg-dark-600 text-gray-300 text-xs font-bold flex items-center gap-2 transition-all self-start"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh list
          </button>
        </div>
      </div>

      {/* Manual register */}
      <div className="glass-card rounded-3xl p-6 border border-gray-800">
        <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-accent-cyan" />
          Register new bot (manual)
        </h2>
        <form onSubmit={handleRegister} className="flex flex-col sm:flex-row gap-3">
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <div className="flex-1">
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                Bot name
              </label>
              <input
                type="text"
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
                placeholder="e.g. bot-1, bot-2"
                disabled={registering}
                className="w-full px-4 py-2.5 rounded-xl bg-dark-800 border border-gray-700 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-yt-red/50 focus:border-yt-red/50"
              />
              <p className="text-[10px] text-gray-500 mt-2">
                Browser open thase → YouTube login → cookies save.
              </p>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={registering || botName.trim().length < 2}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-yt-red to-yt-darkRed hover:opacity-90 disabled:opacity-50 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-glow transition-all"
              >
                {registering ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Waiting login…
                  </>
                ) : (
                  <>
                    <Youtube className="w-4 h-4" />
                    Register & Login
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
        {registering && (
          <div className="mt-4 p-3 rounded-xl bg-yt-red/10 border border-yt-red/30 text-xs text-gray-300">
            Browser window open thase. YouTube ma login kari complete karo.
          </div>
        )}
      </div>

      {/* CSV bulk */}
      <div className="glass-card rounded-3xl p-6 border border-gray-800 space-y-4">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Upload className="w-4 h-4 text-accent-cyan" />
          Bulk register from CSV
        </h2>
        <p className="text-xs text-gray-400">
          Format: <code className="text-accent-cyan">email,password</code> OR {' '}
          <code className="text-accent-cyan">email,password,botName</code>
          <pre className="mt-2 p-3 rounded-xl bg-dark-900 border border-gray-800 text-[11px] text-gray-300 overflow-x-auto">
{`user1@gmail.com,Pass@123
user2@gmail.com,Secret99,bot-alpha`}
          </pre>
          <span className="text-gray-500">
            Google sometimes blocks auto-login (CAPTCHA/rejected). If it fails, register manually.
          </span>
        </p>
        <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40 text-xs font-bold cursor-pointer hover:bg-accent-cyan/30 transition-all">
          <FileText className="w-4 h-4" />
          {csvUploading ? 'Uploading / logging in…' : 'Choose CSV file'}
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            disabled={csvUploading}
            onChange={handleCsvFile}
          />
        </label>
        {csvUploading && (
          <p className="text-xs text-amber-400 flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Accounts sequential login થાય છે – time લાગે.
          </p>
        )}
        {csvResult && (
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-accent-emerald/10 border border-accent-emerald/30 p-3">
              <p className="font-bold text-accent-emerald mb-1">OK ({csvResult.ok?.length || 0})</p>
              <ul className="space-y-1 text-gray-300 max-h-32 overflow-y-auto">
                {(csvResult.ok || []).map((r, i) => (
                  <li key={i}>
                    {r.botName} — {r.email} ({r.cookieCount} cookies)
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3">
              <p className="font-bold text-red-400 mb-1">Failed ({csvResult.failed?.length || 0})</p>
              <ul className="space-y-1 text-gray-300 max-h-32 overflow-y-auto">
                {(csvResult.failed || []).map((r, i) => (
                  <li key={i}>
                    {r.email || `line ${r.line}`}: {r.error}
                  </li>
                ))}
                {!csvResult.failed?.length && <li className="text-gray-500">None</li>}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* List */}
      <div className="glass-card rounded-3xl p-6 border border-gray-800">
        <h2 className="text-sm font-bold text-white mb-4">
          Registered bots <span className="text-gray-500 font-normal">({bots.length})</span>
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400 gap-2 text-sm">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading…
          </div>
        ) : bots.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            No bot. Please register manually or upload a CSV file.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-800">
                  <th className="pb-3 pr-4 font-bold">Bot</th>
                  <th className="pb-3 pr-4 font-bold">Cookies</th>
                  <th className="pb-3 pr-4 font-bold">Created</th>
                  <th className="pb-3 pr-4 font-bold">Updated</th>
                  <th className="pb-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {bots.map((b) => (
                  <tr key={b._id || b.botName} className="hover:bg-dark-700/30">
                    <td className="py-3 pr-4">
                      <span className="font-bold text-white flex items-center gap-2">
                        <Youtube className="w-3.5 h-3.5 text-yt-red" />
                        {b.botName}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-gray-300">
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Cookie className="w-3 h-3 text-accent-cyan" />
                        {(b.cookies && b.cookies.length) || b.cookieCount || '—'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-xs text-gray-400">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {fmt(b.createdAt)}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-xs text-gray-400">{fmt(b.updatedAt)}</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          disabled={busyName === b.botName}
                          onClick={() => handleRefresh(b.botName)}
                          className="p-1.5 rounded-lg bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30 disabled:opacity-50"
                          title="Refresh login"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${busyName === b.botName ? 'animate-spin' : ''}`}
                          />
                        </button>
                        <button
                          type="button"
                          disabled={busyName === b.botName}
                          onClick={() => handleDelete(b.botName)}
                          className="p-1.5 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 disabled:opacity-50"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
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

export default BotManagement;
