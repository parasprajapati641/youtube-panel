import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  Users,
  Search,
  Edit3,
  Ban,
  CheckCircle,
  Save,
  X,
  UserPlus,
  Copy,
  Eye,
  EyeOff,
  Smartphone,
  Bell,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Notifications
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);

  // Create user modal
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [createdCreds, setCreatedCreds] = useState(null);
  const [createForm, setCreateForm] = useState({
    username: '',
    email: '',
    password: '',
    balance: 0,
    isUnlimited: false,
    role: 'user',
    monthlyEarningLimitInr: 0,
    dailyBotLimit: 0,
  });
  const [roleFilter, setRoleFilter] = useState('all'); // all | super_admin | admin | user

  // Editing state for selected user
  const [editingUser, setEditingUser] = useState(null); // full user row when modal open
  const [editForm, setEditForm] = useState({
    username: '',
    email: '',
    password: '',
    balance: 0,
    isUnlimited: false,
    role: 'user',
    monthlyEarningLimitInr: 0,
    dailyBotLimit: 0,
    status: 'active',
    clearChannelLock: false,
    clearDeviceLock: false,
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data);
    } catch (error) {
      toast.error('Failed to load user list');
    } finally {
      setLoading(false);
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/admin/notifications');
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unreadCount || 0);
    } catch (error) {
      // silent
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchNotifications();
    // Poll notifications every 30s
    const t = setInterval(fetchNotifications, 30000);
    return () => clearInterval(t);
  }, []);

  const handleStartEdit = (u) => {
    setEditingUser(u);
    setEditForm({
      username: u.username || '',
      email: u.email || '',
      password: '',
      balance: u.balance || 0,
      isUnlimited: Boolean(u.isUnlimited),
      role: u.role || 'user',
      status: u.status || 'active',
      monthlyEarningLimitInr: u.monthlyEarningLimitInr || 0,
      dailyBotLimit: u.dailyBotLimit || 0,
      clearChannelLock: false,
      clearDeviceLock: false,
    });
  };

  const closeEditModal = () => {
    setEditingUser(null);
    setSavingEdit(false);
  };

  const handleSaveEdit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!editingUser) return;
    setSavingEdit(true);
    try {
      const payload = {
        username: editForm.username,
        email: editForm.email,
        balance: editForm.balance,
        isUnlimited: editForm.isUnlimited,
        role: editForm.role,
        status: editForm.status,
        monthlyEarningLimitInr: editForm.monthlyEarningLimitInr,
        dailyBotLimit: editForm.dailyBotLimit,
      };
      if (editForm.password && editForm.password.length >= 4) {
        payload.password = editForm.password;
      }
      if (editForm.clearChannelLock) payload.clearChannelLock = true;
      if (editForm.clearDeviceLock) payload.clearDeviceLock = true;
      const res = await api.put(`/admin/users/${editingUser._id}`, payload);
      toast.success(res.data.message || 'User updated successfully');
      closeEditModal();
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error updating user');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleUnlimited = async (u) => {
    try {
      const updatedValue = !u.isUnlimited;
      await api.put(`/admin/users/${u._id}`, { isUnlimited: updatedValue });
      toast.success(`Unlimited mode ${updatedValue ? 'enabled' : 'disabled'} for ${u.username}`);
      fetchUsers();
    } catch (error) {
      toast.error('Failed to toggle unlimited status');
    }
  };

  const handleToggleBlock = async (u) => {
    try {
      const newStatus = u.status === 'blocked' ? 'active' : 'blocked';
      await api.put(`/admin/users/${u._id}`, { status: newStatus });
      toast.success(`User ${u.username} is now ${newStatus}`);
      fetchUsers();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleResetDevice = async (u) => {
    if (
      !window.confirm(
        `Reset device binding for "${u.username}"?\nThey will be able to login from a new device.`
      )
    ) {
      return;
    }
    try {
      const res = await api.post(`/admin/users/${u._id}/reset-device`);
      toast.success(res.data.message || 'Device reset successfully');
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to reset device');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!createForm.username || !createForm.email || !createForm.password) {
      toast.error('Username, email and password are required');
      return;
    }
    setCreating(true);
    try {
      const res = await api.post('/admin/users', createForm);
      toast.success(res.data.message || 'User created successfully');
      setCreatedCreds({
        ...(res.data.credentials || {}),
        role: createForm.role,
      });
      setCreateForm({
        username: '',
        email: '',
        password: '',
        balance: 0,
        isUnlimited: false,
        role: 'user',
        monthlyEarningLimitInr: 0,
        dailyBotLimit: 0,
      });
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error creating user');
    } finally {
      setCreating(false);
    }
  };

  const copyCreds = () => {
    if (!createdCreds) return;
    const text = `Username: ${createdCreds.username}\nPassword: ${createdCreds.password}`;
    navigator.clipboard.writeText(text);
    toast.success('Credentials copied!');
  };

  const closeCreateModal = () => {
    setShowCreate(false);
    setCreatedCreds(null);
    setShowPassword(false);
  };

  const markAllRead = async () => {
    try {
      await api.put('/admin/notifications/read', {});
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      toast.success('All notifications marked as read');
    } catch {
      toast.error('Failed to mark as read');
    }
  };

  const filteredUsers = users.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (u.username || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card rounded-3xl p-6 border border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-accent-cyan" />
            User Management & Testing Controls
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Create users, set limits, lock to first device, and view unauthorized login alerts.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search username or email..."
              className="pl-9 pr-4 py-2 rounded-xl glass-input text-xs font-medium w-52"
            />
          </div>

          <button
            onClick={() => setShowNotifs(!showNotifs)}
            className="relative flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 text-xs font-bold hover:bg-amber-500/25 transition-all"
          >
            <Bell className="w-4 h-4" />
            Alerts
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40 text-xs font-bold hover:bg-accent-cyan/30 transition-all"
          >
            <UserPlus className="w-4 h-4" />
            Create User
          </button>
        </div>
      </div>

      {/* Notifications Panel */}
      {showNotifs && (
        <div className="glass-card rounded-3xl p-5 border border-amber-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              Device Login Alerts
              {unreadCount > 0 && (
                <span className="text-xs text-amber-400">({unreadCount} unread)</span>
              )}
            </h2>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs px-3 py-1 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={fetchNotifications}
                className="p-1.5 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {notifications.length === 0 ? (
            <p className="text-xs text-gray-500 py-4 text-center">No alerts yet</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {notifications.map((n) => (
                <div
                  key={n._id}
                  className={`rounded-xl p-3 border text-xs ${n.isRead
                    ? 'bg-dark-800/50 border-gray-800 text-gray-400'
                    : 'bg-amber-500/10 border-amber-500/30 text-gray-200'
                    }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-white">{n.title}</p>
                      <p className="mt-0.5">{n.message}</p>
                      {n.meta?.attemptedDeviceInfo && (
                        <p className="mt-1 text-gray-500 truncate max-w-md">
                          Device: {n.meta.attemptedDeviceInfo}
                        </p>
                      )}
                      {n.meta?.ip && (
                        <p className="text-gray-500">IP: {n.meta.ip}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-500 whitespace-nowrap">
                      {n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}


      {/* Edit User Modal – same layout as Create: header + scroll + sticky footer */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4">
          <div className="glass-card rounded-2xl sm:rounded-3xl border border-gray-700 w-full max-w-md max-h-[min(90vh,720px)] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 min-w-0">
                <Edit3 className="w-5 h-5 text-accent-cyan shrink-0" />
                <span className="truncate">Edit: {editingUser.username}</span>
              </h2>
              <button type="button" onClick={closeEditModal} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-dark-700 shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 font-semibold">Username</label>
                    <input
                      type="text"
                      value={editForm.username}
                      onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                      className="w-full mt-1 px-3 py-2 rounded-xl glass-input text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 font-semibold">Email</label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      className="w-full mt-1 px-3 py-2 rounded-xl glass-input text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-400 font-semibold">New password (optional)</label>
                  <input
                    type="text"
                    value={editForm.password}
                    onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl glass-input text-sm"
                    placeholder="Leave blank to keep current"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 font-semibold">Role</label>
                    <select
                      value={editForm.role}
                      onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                      className="w-full mt-1 px-3 py-2 rounded-xl glass-input text-sm"
                    >
                      <option value="user" className="bg-dark-800">User</option>
                      <option value="admin" className="bg-dark-800">Admin</option>
                      <option value="super_admin" className="bg-dark-800">Super Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 font-semibold">Status</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                      className="w-full mt-1 px-3 py-2 rounded-xl glass-input text-sm"
                    >
                      <option value="active" className="bg-dark-800">active</option>
                      <option value="blocked" className="bg-dark-800">blocked</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 font-semibold">Balance ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editForm.balance}
                      onChange={(e) => setEditForm({ ...editForm, balance: Number(e.target.value) })}
                      className="w-full mt-1 px-3 py-2 rounded-xl glass-input text-sm font-bold text-accent-emerald"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer pt-6">
                    <input
                      type="checkbox"
                      checked={editForm.isUnlimited}
                      onChange={(e) => setEditForm({ ...editForm, isUnlimited: e.target.checked })}
                      className="w-4 h-4 accent-accent-purple rounded"
                    />
                    <span className="text-xs text-gray-300 font-semibold">Unlimited orders</span>
                  </label>
                </div>

                {editForm.role === 'admin' && (
                  <div className="space-y-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-amber-400 font-semibold">Earnings ₹ / month</label>
                        <input
                          type="number"
                          min="0"
                          value={editForm.monthlyEarningLimitInr}
                          onChange={(e) =>
                            setEditForm({ ...editForm, monthlyEarningLimitInr: Number(e.target.value) })
                          }
                          className="w-full mt-1 px-3 py-2 rounded-xl glass-input text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-accent-cyan font-semibold">Daily like & comment limit</label>
                        <input
                          type="number"
                          min="0"
                          value={editForm.dailyBotLimit}
                          onChange={(e) =>
                            setEditForm({ ...editForm, dailyBotLimit: Number(e.target.value) })
                          }
                          className="w-full mt-1 px-3 py-2 rounded-xl glass-input text-sm"
                        />
                      </div>
                    </div>

                    <div className="text-[11px] text-gray-400 space-y-2">
                      <p>
                        Channel:{' '}
                        <span className="text-white">
                          {editingUser.lockedChannelTitle || editingUser.lockedChannelId || 'Not locked'}
                        </span>
                      </p>
                      {(editingUser.lockedChannelId || editingUser.lockedChannelTitle) && (
                        <label className="flex items-center gap-2 text-amber-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!editForm.clearChannelLock}
                            onChange={(e) =>
                              setEditForm({ ...editForm, clearChannelLock: e.target.checked })
                            }
                          />
                          Clear channel lock (next order re-locks)
                        </label>
                      )}
                      <p>
                        Device:{' '}
                        <span className="text-white">
                          {editingUser.boundDeviceId ? 'Locked' : 'Not logged in'}
                        </span>
                      </p>
                      {editingUser.boundDeviceId && (
                        <label className="flex items-center gap-2 text-amber-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!editForm.clearDeviceLock}
                            onChange={(e) =>
                              setEditForm({ ...editForm, clearDeviceLock: e.target.checked })
                            }
                          />
                          Clear device lock (next login re-locks)
                        </label>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Sticky footer */}
              <div className="shrink-0 px-5 py-3 border-t border-gray-800 bg-dark-900/95 flex gap-2">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-dark-700 text-gray-300 text-sm font-bold border border-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-yt-red to-yt-darkRed text-white text-sm font-extrabold disabled:opacity-50"
                >
                  {savingEdit ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create User Modal – header + scroll body + sticky Create button */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4">
          <div className="glass-card rounded-2xl sm:rounded-3xl border border-gray-700 w-full max-w-md max-h-[min(90vh,720px)] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-accent-cyan" />
                Create New User
              </h2>
              <button type="button" onClick={closeCreateModal} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-dark-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            {createdCreds ? (
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                <div className="rounded-xl bg-accent-emerald/10 border border-accent-emerald/30 p-4">
                  <p className="text-sm text-accent-emerald font-semibold mb-2">
                    User created! Share these credentials:
                  </p>
                  <div className="space-y-1 text-sm text-white font-mono">
                    <p>
                      <span className="text-gray-400">Username:</span> {createdCreds.username}
                    </p>
                    <p>
                      <span className="text-gray-400">Password:</span> {createdCreds.password}
                    </p>
                  </div>
                  {createdCreds?.role === 'admin' ? (
                    <p className="text-xs text-amber-400/90 mt-3">
                      ⚠️ <strong className="text-white">Admin only:</strong> first login locks device.
                      Other device → deactivated + Super Admin alert.
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500 mt-3">
                      Normal user – no device lock.
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={copyCreds}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40 text-xs font-bold"
                  >
                    <Copy className="w-4 h-4" />
                    Copy Credentials
                  </button>
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-gray-700 text-white text-xs font-bold"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateUser} className="flex flex-col flex-1 min-h-0">
                {/* Scrollable fields */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 space-y-3">
                  <div>
                    <label className="text-xs text-gray-400 font-semibold">Username *</label>
                    <input
                      type="text"
                      value={createForm.username}
                      onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                      className="w-full mt-1 px-3 py-2 rounded-xl glass-input text-sm"
                      placeholder="e.g. client1"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 font-semibold">Email *</label>
                    <input
                      type="email"
                      value={createForm.email}
                      onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                      className="w-full mt-1 px-3 py-2 rounded-xl glass-input text-sm"
                      placeholder="client1@example.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 font-semibold">Password *</label>
                    <div className="relative mt-1">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={createForm.password}
                        onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl glass-input text-sm pr-10"
                        placeholder="Set a password"
                        required
                        minLength={4}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-gray-400"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-400 font-semibold">Starting Balance ($)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={createForm.balance}
                        onChange={(e) => setCreateForm({ ...createForm, balance: Number(e.target.value) })}
                        className="w-full mt-1 px-3 py-2 rounded-xl glass-input text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 font-semibold">Role</label>
                      <select
                        value={createForm.role}
                        onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                        className="w-full mt-1 px-3 py-2 rounded-xl glass-input text-sm"
                      >
                        <option value="user" className="bg-dark-800">User</option>
                        <option value="admin" className="bg-dark-800">Admin</option>
                        <option value="super_admin" className="bg-dark-800">Super Admin</option>
                      </select>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createForm.isUnlimited}
                      onChange={(e) => setCreateForm({ ...createForm, isUnlimited: e.target.checked })}
                      className="w-4 h-4 accent-accent-purple rounded"
                    />
                    <span className="text-xs text-gray-300 font-semibold">
                      Unlimited (no balance limit for orders)
                    </span>
                  </label>

                  {createForm.role === 'admin' ? (
                    <p className="text-[11px] text-amber-400/80 leading-relaxed">
                      Admin: first login locks device. Other device → deactivated + Super Admin alert.
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-500">
                      Device lock applies only to <strong className="text-gray-400">Admin</strong> role.
                    </p>
                  )}

                  {createForm.role === 'admin' && (
                    <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                      <div>
                        <label className="text-xs text-amber-400 font-semibold">
                          Earnings limit (₹ / month) *
                        </label>
                        <input
                          type="number"
                          min="0"
                          required
                          value={createForm.monthlyEarningLimitInr}
                          onChange={(e) =>
                            setCreateForm({
                              ...createForm,
                              monthlyEarningLimitInr: Number(e.target.value),
                            })
                          }
                          className="w-full mt-1 px-3 py-2 rounded-xl glass-input text-sm"
                          placeholder="e.g. 50000"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-accent-cyan font-semibold">
                          Daily limit (likes & comments each) *
                        </label>
                        <input
                          type="number"
                          min="0"
                          required
                          value={createForm.dailyBotLimit}
                          onChange={(e) =>
                            setCreateForm({
                              ...createForm,
                              dailyBotLimit: Number(e.target.value),
                            })
                          }
                          className="w-full mt-1 px-3 py-2 rounded-xl glass-input text-sm"
                          placeholder="e.g. 100"
                        />
                      </div>
                      <p className="col-span-2 text-[10px] text-gray-500 leading-relaxed">
                        Daily limit <strong className="text-gray-400">100</strong> = up to{' '}
                        <strong className="text-gray-400">100 likes</strong> and{' '}
                        <strong className="text-gray-400">100 comments</strong> per day (separate).
                      </p>
                    </div>
                  )}
                </div>

                {/* Sticky footer – always visible */}
                <div className="shrink-0 px-5 py-3 border-t border-gray-800 bg-dark-900/95">
                  <button
                    type="submit"
                    disabled={creating}
                    className="w-full py-2.5 rounded-xl bg-accent-cyan text-dark-900 font-bold text-sm hover:opacity-90 disabled:opacity-50"
                  >
                    {creating ? 'Creating...' : 'Create User'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="glass-card rounded-3xl p-6 border border-gray-800">
        {loading ? (
          <div className="py-12 text-center text-gray-500 text-sm">
            <div className="w-8 h-8 border-4 border-accent-cyan border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            Loading registered users...
          </div>
        ) : (
          <div className="data-table-wrap overflow-x-auto">

            {/* Role filter tabs */}
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                { id: 'all', label: 'All' },
                { id: 'super_admin', label: 'Super Admin' },
                { id: 'admin', label: 'Admin' },
                { id: 'user', label: 'User' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setRoleFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${roleFilter === f.id
                    ? 'bg-yt-red/20 text-yt-red border-yt-red/40'
                    : 'bg-dark-800 text-gray-400 border-gray-700 hover:text-white'
                    }`}
                >
                  {f.label}
                  <span className="ml-1 text-[10px] opacity-70">
                    (
                    {f.id === 'all'
                      ? users.length
                      : users.filter((u) => u.role === f.id).length}
                    )
                  </span>
                </button>
              ))}
            </div>
            <table className="w-full text-left text-sm data-table">
              <thead>
                <tr className="border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="pb-3 px-3">User Details</th>
                  <th className="pb-3 px-3">Role</th>
                  <th className="pb-3 px-3">Balance</th>
                  <th className="pb-3 px-3">Channel</th>
                  <th className="pb-3 px-3">Earnings ₹</th>
                  <th className="pb-3 px-3">Bot limit</th>
                  <th className="pb-3 px-3">Unlimited</th>
                  <th className="pb-3 px-3">Device</th>
                  <th className="pb-3 px-3">Status</th>
                  <th className="pb-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {filteredUsers.map((u) => {
                  const isBound = Boolean(u.boundDeviceId);
                  return (
                    <tr key={u._id} className="hover:bg-dark-700/30 transition-colors">
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-tr from-gray-700 to-gray-600 flex items-center justify-center font-bold text-xs uppercase text-white">
                            {(u.username || '?').charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-white block truncate max-w-[140px]">{u.username}</span>
                            <span className="text-xs text-gray-400 block truncate max-w-[160px]">{u.email}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                            u.role === 'admin' || u.role === 'super_admin'
                              ? 'bg-yt-red/15 text-yt-red border-yt-red/30'
                              : 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>

                      <td className="py-3 px-3 font-bold text-accent-emerald whitespace-nowrap">
                        {'$' + (u.balance || 0).toFixed(2)}
                      </td>

                      <td className="py-3 px-3 text-xs text-gray-300 max-w-[120px]">
                        {u.role === 'admin' ? (
                          <span className="font-semibold text-white block truncate" title={u.lockedChannelUrl || ''}>
                            {u.lockedChannelTitle || u.lockedChannelId || '—'}
                          </span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-xs text-amber-400 font-semibold whitespace-nowrap">
                        {u.role === 'admin' ? (
                          <span>
                            ₹{u.monthlyEarningUsedInr || 0}
                            <span className="text-gray-500">/{u.monthlyEarningLimitInr || 0}</span>
                          </span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-xs text-accent-cyan font-semibold whitespace-nowrap">
                        {u.role === 'admin' ? (
                          <span>
                            <span className="block text-[10px] text-gray-400">
                              Like {u.dailyLikeUsed || 0}/{u.dailyBotLimit || 0}
                            </span>
                            <span className="block text-[10px] text-gray-400">
                              Comment {u.dailyCommentUsed || 0}/{u.dailyBotLimit || 0}
                            </span>
                          </span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleUnlimited(u)}
                          className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-all ${
                            u.isUnlimited
                              ? 'bg-accent-purple/20 text-accent-purple border-accent-purple/40'
                              : 'bg-gray-800 text-gray-400 border-gray-700'
                          }`}
                        >
                          {u.isUnlimited ? 'Unlimited ON' : 'Limited'}
                        </button>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {u.role === 'admin' ? (
                          isBound ? (
                            <div className="flex flex-col gap-0.5 min-w-0 max-w-[160px]">
                              <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-accent-emerald/15 text-accent-emerald border border-accent-emerald/30 w-fit">
                                Locked
                              </span>
                              <span className="text-[10px] text-gray-400 truncate" title={u.boundDeviceInfo || ''}>
                                {u.boundDeviceInfo || 'Device bound'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 w-fit">
                              Not logged in
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-gray-500">—</span>
                        )}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                            u.status === 'active'
                              ? 'bg-accent-emerald/15 text-accent-emerald border-accent-emerald/30'
                              : 'bg-red-500/15 text-red-400 border-red-500/30'
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(u)}
                            className="p-1.5 rounded-lg bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30"
                            title="Edit User"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {u.role === 'admin' && u.status === 'blocked' && isBound && (
                            <button
                              type="button"
                              onClick={() => handleResetDevice(u)}
                              className="p-1.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30"
                              title="Reset device binding"
                            >
                              <Smartphone className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleToggleBlock(u)}
                            className={`p-1.5 rounded-lg border transition-all ${
                              u.status === 'blocked'
                                ? 'bg-accent-emerald/15 text-accent-emerald border-accent-emerald/30'
                                : 'bg-red-500/15 text-red-400 border-red-500/30'
                            }`}
                            title={u.status === 'blocked' ? 'Unblock' : 'Block'}
                          >
                            {u.status === 'blocked' ? (
                              <CheckCircle className="w-4 h-4" />
                            ) : (
                              <Ban className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserManagement;
