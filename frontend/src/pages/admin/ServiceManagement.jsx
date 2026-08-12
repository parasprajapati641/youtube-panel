import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Layers, Plus, Edit2, Trash2, CheckCircle, XCircle, Search, Save, X } from 'lucide-react';

const ServiceManagement = () => {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    category: 'YouTube Views',
    ratePer1000: 1.5,
    minQuantity: 100,
    maxQuantity: 100000,
    status: 'active',
    description: '',
    providerServiceId: '',
  });

  const categories = [
    'YouTube Views',
    'YouTube Subscribers',
    'YouTube Likes',
    'YouTube Watch Hours',
    'Instagram Likes',
    'Instagram Followers',
    'Facebook Services',
  ];

  const fetchServices = async () => {
    try {
      const res = await api.get('/admin/services');
      setServices(res.data);
    } catch (error) {
      toast.error('Failed to fetch service catalog');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, []);

  const handleOpenAddModal = () => {
    setEditingService(null);
    setFormData({
      name: '',
      category: 'YouTube Views',
      ratePer1000: 1.5,
      minQuantity: 100,
      maxQuantity: 100000,
      status: 'active',
      description: '',
      providerServiceId: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (srv) => {
    setEditingService(srv);
    setFormData({
      name: srv.name,
      category: srv.category,
      ratePer1000: srv.ratePer1000,
      minQuantity: srv.minQuantity,
      maxQuantity: srv.maxQuantity,
      status: srv.status,
      description: srv.description || '',
      providerServiceId: srv.providerServiceId || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmitModal = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.category) {
      toast.error('Please enter name and category');
      return;
    }

    try {
      if (editingService) {
        await api.put(`/admin/services/${editingService._id}`, formData);
        toast.success('Service updated successfully!');
      } else {
        await api.post('/admin/services', formData);
        toast.success('New service package created!');
      }
      setIsModalOpen(false);
      fetchServices();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error saving service');
    }
  };

  const handleDeleteService = async (id) => {
    if (!window.confirm('Are you sure you want to delete this service?')) return;
    try {
      await api.delete(`/admin/services/${id}`);
      toast.success('Service deleted successfully');
      fetchServices();
    } catch (error) {
      toast.error('Error deleting service');
    }
  };

  const filteredServices = services.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card rounded-3xl p-6 border border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Layers className="w-6 h-6 text-yt-red" />
            Service Package Management (CRUD)
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Add, update, or remove YouTube & Social Media growth packages and rates.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search service..."
              className="pl-9 pr-4 py-2 rounded-xl glass-input text-xs font-medium w-48"
            />
          </div>

          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-yt-red to-yt-darkRed hover:from-yt-lightRed hover:to-yt-red text-white text-xs font-bold shadow-glow transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Service</span>
          </button>
        </div>
      </div>

      {/* Services List Table */}
      <div className="glass-card rounded-3xl p-6 border border-gray-800">
        {loading ? (
          <div className="py-12 text-center text-gray-500 text-sm">
            <div className="w-8 h-8 border-4 border-yt-red border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            Loading service database...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="pb-3 px-3">Service Name</th>
                  <th className="pb-3 px-3">Category</th>
                  <th className="pb-3 px-3">Rate / 1000</th>
                  <th className="pb-3 px-3">Min / Max</th>
                  <th className="pb-3 px-3">Status</th>
                  <th className="pb-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {filteredServices.map((srv) => (
                  <tr key={srv._id} className="hover:bg-dark-700/30 transition-colors">
                    <td className="py-4 px-3 font-medium text-white max-w-sm">
                      <div className="font-semibold text-white">{srv.name}</div>
                      <div className="text-xs text-gray-400 truncate max-w-xs">{srv.description}</div>
                    </td>
                    <td className="py-4 px-3">
                      <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-dark-700 text-gray-300 border border-gray-700">
                        {srv.category}
                      </span>
                    </td>
                    <td className="py-4 px-3 font-bold text-accent-emerald">
                      ${srv.ratePer1000.toFixed(2)}
                    </td>
                    <td className="py-4 px-3 text-xs text-gray-300 font-semibold">
                      {srv.minQuantity} / {srv.maxQuantity.toLocaleString()}
                    </td>
                    <td className="py-4 px-3">
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                          srv.status === 'active'
                            ? 'bg-accent-emerald/15 text-accent-emerald border-accent-emerald/30'
                            : 'bg-gray-800 text-gray-500 border-gray-700'
                        }`}
                      >
                        {srv.status}
                      </span>
                    </td>
                    <td className="py-4 px-3 text-right space-x-2">
                      <button
                        onClick={() => handleOpenEditModal(srv)}
                        className="p-1.5 rounded-lg bg-dark-700 text-gray-300 hover:text-white border border-gray-700 transition-all"
                        title="Edit Service"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteService(srv._id)}
                        className="p-1.5 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30 transition-all"
                        title="Delete Service"
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

      {/* Service Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg glass-card rounded-3xl p-6 border border-gray-800 space-y-5 relative">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="text-lg font-bold text-white">
                {editingService ? 'Edit SMM Service' : 'Add New SMM Service'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitModal} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-1">Service Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. YouTube Views High Retention"
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-semibold cursor-pointer"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c} className="bg-dark-800">{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase mb-1">Rate / 1000 ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.ratePer1000}
                    onChange={(e) => setFormData({ ...formData, ratePer1000: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm font-bold text-accent-emerald"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase mb-1">Min Quantity</label>
                  <input
                    type="number"
                    required
                    value={formData.minQuantity}
                    onChange={(e) => setFormData({ ...formData, minQuantity: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase mb-1">Max Quantity</label>
                  <input
                    type="number"
                    required
                    value={formData.maxQuantity}
                    onChange={(e) => setFormData({ ...formData, maxQuantity: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
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

                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase mb-1">Provider ID</label>
                  <input
                    type="text"
                    value={formData.providerServiceId}
                    onChange={(e) => setFormData({ ...formData, providerServiceId: e.target.value })}
                    placeholder="e.g. YT-VIEW-101"
                    className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-1">Description</label>
                <textarea
                  rows="2"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Service features & guarantee terms..."
                  className="w-full px-3.5 py-2 rounded-xl glass-input text-xs font-medium"
                ></textarea>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-gradient-to-r from-yt-red to-yt-darkRed text-white font-bold text-sm shadow-glow flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Save Service Package</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceManagement;
