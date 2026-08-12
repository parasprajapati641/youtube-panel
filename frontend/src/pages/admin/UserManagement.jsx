import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Users, Search, Edit3, ShieldAlert, Sparkles, Ban, CheckCircle, Save, X } from 'lucide-react';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Editing state for selected user
  const [editingUserId, setEditingUserId] = useState(null);
  const [editForm, setEditForm] = useState({
    balance: 0,
    isUnlimited: false,
    role: 'user',
    status: 'active',
  });

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

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleStartEdit = (u) => {
    setEditingUserId(u._id);
    setEditForm({
      balance: u.balance || 0,
      isUnlimited: Boolean(u.isUnlimited),
      role: u.role || 'user',
      status: u.status || 'active',
    });
  };

  const handleSaveEdit = async (userId) => {
    try {
      const res = await api.put(`/admin/users/${userId}`, editForm);
      toast.success(res.data.message || 'User updated successfully');
      setEditingUserId(null);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error updating user');
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

  const filteredUsers = users.filter(
    (u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

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
            Manage user accounts, adjust balances, toggle unlimited test flags, and block/unblock users.
          </p>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search username or email..."
            className="pl-9 pr-4 py-2 rounded-xl glass-input text-xs font-medium w-60"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="glass-card rounded-3xl p-6 border border-gray-800">
        {loading ? (
          <div className="py-12 text-center text-gray-500 text-sm">
            <div className="w-8 h-8 border-4 border-accent-cyan border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            Loading registered users...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="pb-3 px-3">User Details</th>
                  <th className="pb-3 px-3">Role</th>
                  <th className="pb-3 px-3">Balance</th>
                  <th className="pb-3 px-3">Unlimited Test Flag</th>
                  <th className="pb-3 px-3">Status</th>
                  <th className="pb-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {filteredUsers.map((u) => {
                  const isEditing = editingUserId === u._id;
                  return (
                    <tr key={u._id} className="hover:bg-dark-700/30 transition-colors">
                      {/* User details */}
                      <td className="py-4 px-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-gray-700 to-gray-600 flex items-center justify-center font-bold text-xs uppercase text-white">
                            {u.username.charAt(0)}
                          </div>
                          <div>
                            <span className="font-bold text-white block">{u.username}</span>
                            <span className="text-xs text-gray-400">{u.email}</span>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-4 px-3">
                        {isEditing ? (
                          <select
                            value={editForm.role}
                            onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                            className="px-2 py-1 rounded-lg glass-input text-xs font-semibold"
                          >
                            <option value="user" className="bg-dark-800">User</option>
                            <option value="admin" className="bg-dark-800">Admin</option>
                          </select>
                        ) : (
                          <span
                            className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                              u.role === 'admin'
                                ? 'bg-yt-red/15 text-yt-red border-yt-red/30'
                                : 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20'
                            }`}
                          >
                            {u.role}
                          </span>
                        )}
                      </td>

                      {/* Balance */}
                      <td className="py-4 px-3 font-bold text-accent-emerald">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editForm.balance}
                            onChange={(e) => setEditForm({ ...editForm, balance: Number(e.target.value) })}
                            className="w-24 px-2 py-1 rounded-lg glass-input text-xs font-bold text-accent-emerald"
                          />
                        ) : (
                          `$${(u.balance || 0).toFixed(2)}`
                        )}
                      </td>

                      {/* Unlimited Toggle */}
                      <td className="py-4 px-3">
                        {isEditing ? (
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editForm.isUnlimited}
                              onChange={(e) => setEditForm({ ...editForm, isUnlimited: e.target.checked })}
                              className="w-4 h-4 accent-accent-purple rounded"
                            />
                            <span className="text-xs text-gray-300 font-semibold">isUnlimited</span>
                          </label>
                        ) : (
                          <button
                            onClick={() => handleToggleUnlimited(u)}
                            className={`px-3 py-1 rounded-full text-xs font-bold border transition-all flex items-center gap-1.5 ${
                              u.isUnlimited
                                ? 'bg-accent-purple/20 text-accent-cyan border-accent-purple/40 shadow-glow-cyan'
                                : 'bg-dark-800 text-gray-400 border-gray-700 hover:text-white'
                            }`}
                          >
                            <Sparkles className="w-3 h-3" />
                            {u.isUnlimited ? 'UNLIMITED ON' : 'Disabled'}
                          </button>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-3">
                        <span
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                            u.status === 'blocked'
                              ? 'bg-red-500/20 text-red-400 border-red-500/40'
                              : 'bg-accent-emerald/15 text-accent-emerald border-accent-emerald/30'
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-3 text-right space-x-2">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => handleSaveEdit(u._id)}
                              className="p-1.5 rounded-lg bg-accent-emerald/20 text-accent-emerald border border-accent-emerald/30 hover:bg-accent-emerald/30 transition-all"
                              title="Save Changes"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingUserId(null)}
                              className="p-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white transition-all"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleStartEdit(u)}
                              className="p-1.5 rounded-lg bg-dark-700 text-gray-300 hover:text-white border border-gray-700 transition-all"
                              title="Edit User"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleToggleBlock(u)}
                              className={`p-1.5 rounded-lg border transition-all ${
                                u.status === 'blocked'
                                  ? 'bg-accent-emerald/15 text-accent-emerald border-accent-emerald/30'
                                  : 'bg-red-500/15 text-red-400 border-red-500/30'
                              }`}
                              title={u.status === 'blocked' ? 'Unblock User' : 'Block User'}
                            >
                              {u.status === 'blocked' ? <CheckCircle className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                            </button>
                          </>
                        )}
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
