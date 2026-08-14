import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Link as LinkIcon, Hash, DollarSign, AlertCircle, CheckCircle2, Sparkles, MessageSquare } from 'lucide-react';

const NewOrder = () => {
  const { user, updateBalance } = useAuth();
  const navigate = useNavigate();

  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(true);

  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [link, setLink] = useState('');
  const [quantity, setQuantity] = useState(1000);
  const [submitting, setSubmitting] = useState(false);

  // Fetch active services
  useEffect(() => {
    const fetchServices = async () => {
      try {
        const res = await api.get('/services');
        setServices(res.data);
        if (res.data.length > 0) {
          const categories = Array.from(new Set(res.data.map((s) => s.category)));
          setSelectedCategory(categories[0]);
        }
      } catch (error) {
        toast.error('Failed to load active services');
      } finally {
        setLoadingServices(false);
      }
    };
    fetchServices();
  }, []);

  // Filter services by selected category
  const categoryServices = useMemo(() => {
    if (!selectedCategory) return [];
    return services.filter((s) => s.category === selectedCategory);
  }, [services, selectedCategory]);

  // Get currently selected service object
  const currentService = useMemo(() => {
    return services.find((s) => s._id === selectedServiceId) || null;
  }, [services, selectedServiceId]);

  // Update selected service when category changes
  useEffect(() => {
    if (categoryServices.length > 0) {
      const firstSrv = categoryServices[0];
      setSelectedServiceId(firstSrv._id);
      setQuantity(firstSrv.minQuantity || 1000);
    } else {
      setSelectedServiceId('');
    }
  }, [selectedCategory, categoryServices]);

  // Auto calculate total cost: (quantity / 1000) * ratePer1000
  const calculatedCost = useMemo(() => {
    if (!currentService || !quantity || quantity <= 0) return 0;
    return Number(((quantity / 1000) * currentService.ratePer1000).toFixed(4));
  }, [currentService, quantity]);

  const availableCategories = useMemo(() => {
    return Array.from(new Set(services.map((s) => s.category)));
  }, [services]);

  const isBalanceSufficient = user?.isUnlimited || (user?.balance || 0) >= calculatedCost;

  const minLimit = currentService?.minQuantity || 1;
  const maxLimit = currentService?.maxQuantity || 1000000;
  const isQuantityTooLow = currentService ? quantity < minLimit : false;
  const isQuantityTooHigh = currentService ? quantity > maxLimit : false;
  const isQuantityInvalid = isQuantityTooLow || isQuantityTooHigh;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedServiceId) {
      toast.error('Please select a service');
      return;
    }
    if (!link.trim()) {
      toast.error('Please enter a valid target link');
      return;
    }

    if (!quantity || quantity <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }

    if (currentService) {
      if (quantity < currentService.minQuantity || quantity > currentService.maxQuantity) {
        toast.error(`Quantity must be between ${currentService.minQuantity.toLocaleString()} and ${currentService.maxQuantity.toLocaleString()}`);
        return;
      }
    }

    if (!isBalanceSufficient) {
      toast.error(`Insufficient balance ($${(user?.balance || 0).toFixed(2)} available). Please add funds!`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/orders', {
        serviceId: selectedServiceId,
        link: link.trim(),
        quantity: Number(quantity),
      });

      toast.success(res.data.message || 'Order placed successfully!');
      
      // Update global user balance
      if (res.data.newBalance !== undefined) {
        updateBalance(res.data.newBalance);
      }

      navigate('/orders');
    } catch (error) {
      const msg = error.response?.data?.message || 'Failed to place order';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-hidden space-y-4 sm:space-y-6">
      {/* Title */}
      <div className="glass-card rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 border border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 w-full max-w-full box-border overflow-hidden">
        <div>
          <h1 className="text-lg sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 text-yt-red shrink-0" />
            <span>Place New SMM Order</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Select a social media service package, enter your target link and quantity.
          </p>
        </div>

        {user?.isUnlimited && (
          <div className="bg-accent-purple/20 border border-accent-purple/40 text-accent-cyan text-xs font-bold px-3 py-1.5 rounded-2xl flex items-center gap-1.5 shadow-glow-cyan animate-pulse self-start sm:self-auto shrink-0">
            <Sparkles className="w-4 h-4 text-accent-cyan shrink-0" />
            <span>Zero-Cost Admin Mode</span>
          </div>
        )}
      </div>

      {loadingServices ? (
        <div className="glass-card rounded-2xl sm:rounded-3xl p-8 sm:p-12 text-center text-gray-500 w-full max-w-full box-border">
          <div className="w-8 h-8 border-4 border-yt-red border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          Loading SMM services catalog...
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="glass-card rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 md:p-8 border border-gray-800 space-y-4 sm:space-y-6 w-full max-w-full box-border overflow-hidden">
          {/* Category Dropdown */}
          <div className="w-full min-w-0">
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
              1. Select Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full min-w-0 px-3.5 sm:px-4 py-3 rounded-xl glass-input text-xs sm:text-sm font-semibold cursor-pointer box-border"
            >
              {availableCategories.map((cat) => (
                <option key={cat} value={cat} className="bg-dark-800 text-white">
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Quality Tier Selector Buttons */}
          {categoryServices.length > 1 && (
            <div className="w-full min-w-0">
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
                2. Select Quality Tier
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 w-full max-w-full">
                {categoryServices.map((srv) => {
                  const isSelected = srv._id === selectedServiceId;
                  const isPremium = srv.name.includes('Premium');
                  const isStandard = srv.name.includes('Standard');
                  const isSimple = srv.name.includes('Simple');

                  let tierLabel = 'Standard Tier';
                  let badgeColor = 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30';
                  if (isPremium) {
                    tierLabel = 'Premium Tier (Non-Drop)';
                    badgeColor = 'bg-yt-red/20 text-yt-red border-yt-red/40';
                  } else if (isSimple) {
                    tierLabel = 'Simple / Basic Tier';
                    badgeColor = 'bg-gray-700/50 text-gray-300 border-gray-600';
                  } else if (isStandard) {
                    tierLabel = 'Standard (High Quality)';
                    badgeColor = 'bg-accent-emerald/15 text-accent-emerald border-accent-emerald/30';
                  }

                  return (
                    <button
                      key={srv._id}
                      type="button"
                      onClick={() => {
                        setSelectedServiceId(srv._id);
                        setQuantity(srv.minQuantity || 1000);
                      }}
                      className={`w-full min-w-0 p-3 sm:p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-2 box-border overflow-hidden ${
                        isSelected
                          ? 'bg-dark-700 border-yt-red shadow-glow ring-1 ring-yt-red'
                          : 'bg-dark-800/60 border-gray-800 hover:border-gray-700 hover:bg-dark-700/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 min-w-0">
                        <span className={`text-[9px] sm:text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded-md border truncate ${badgeColor}`}>
                          {tierLabel}
                        </span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-yt-red shrink-0" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">{srv.name}</div>
                        <div className="text-xs sm:text-sm font-black text-accent-emerald mt-0.5">
                          ${srv.ratePer1000.toFixed(2)} <span className="text-[10px] text-gray-400 font-normal">/ 1k</span>
                          <span className="text-[10px] sm:text-[11px] text-gray-400 font-normal ml-1">(₹{(srv.ratePer1000 * 82).toFixed(0)})</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Service Dropdown */}
          <div className="w-full min-w-0">
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
              3. Service Package Details
            </label>
            <select
              value={selectedServiceId}
              onChange={(e) => {
                setSelectedServiceId(e.target.value);
                const s = services.find((srv) => srv._id === e.target.value);
                if (s) setQuantity(s.minQuantity || 1000);
              }}
              className="w-full min-w-0 px-3.5 sm:px-4 py-3 rounded-xl glass-input text-xs sm:text-sm font-semibold cursor-pointer box-border"
            >
              {categoryServices.map((srv) => (
                <option key={srv._id} value={srv._id} className="bg-dark-800 text-white">
                  {srv.name} — ${srv.ratePer1000.toFixed(2)} / 1000 (₹{(srv.ratePer1000 * 82).toFixed(0)})
                </option>
              ))}
            </select>
          </div>

          {/* Service Info Box */}
          {currentService && (
            <div className="p-3 sm:p-4 rounded-2xl bg-dark-800/80 border border-gray-800 text-xs text-gray-300 space-y-2.5 w-full max-w-full min-w-0 box-border overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 font-semibold">
                <span className="text-gray-300">
                  Rate: <strong className="text-accent-emerald text-xs sm:text-sm">${currentService.ratePer1000.toFixed(2)} / 1000</strong>
                  <span className="text-gray-400 text-[11px] ml-1">(~₹{(currentService.ratePer1000 * 82).toFixed(0)})</span>
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-[11px] sm:text-xs flex items-center gap-1 break-words max-w-full">
                  🛡️ 100% Lifetime Guaranteed Non-Drop
                </span>
                <span className="px-2 py-0.5 rounded-full bg-accent-cyan/10 border border-accent-cyan/30 text-accent-cyan font-bold text-[11px] sm:text-xs flex items-center gap-1 max-w-full">
                  ⚡ {currentService.speed || 'Instant delivery'}
                </span>
                <span className="text-gray-400 text-[11px] sm:text-xs">
                  Min: <strong className="text-accent-cyan">{minLimit.toLocaleString()}</strong> | Max: <strong className="text-accent-cyan">{maxLimit.toLocaleString()}</strong>
                </span>
              </div>
              {currentService.description && (
                <p className="text-gray-400 text-xs pt-2 border-t border-gray-800/80 leading-relaxed break-words">
                  {currentService.description.includes('100% Lifetime Guaranteed Non-Drop') 
                    ? currentService.description 
                    : `100% Lifetime Guaranteed Non-Drop Services. ${currentService.description}`}
                </p>
              )}
            </div>
          )}

          {/* Target Link */}
          <div className="w-full min-w-0">
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
              4. Target Link / URL
            </label>
            <div className="relative w-full min-w-0">
              <LinkIcon className="w-4 h-4 sm:w-5 sm:h-5 absolute left-3.5 top-3.5 text-gray-500" />
              <input
                type="url"
                required
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="e.g. https://www.youtube.com/watch?v=dQw4w9WgXcQ"
                className="w-full min-w-0 pl-10 sm:pl-11 pr-4 py-3 rounded-xl glass-input text-xs sm:text-sm font-medium box-border"
              />
            </div>
          </div>

          {/* Quantity */}
          <div className="w-full min-w-0">
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2 flex items-center justify-between gap-1">
              <span>5. Quantity</span>
              {currentService && (
                <span className="text-[10px] sm:text-[11px] font-normal text-gray-400">
                  Min: <strong className="text-accent-cyan">{minLimit.toLocaleString()}</strong> — Max: <strong className="text-accent-cyan">{maxLimit.toLocaleString()}</strong>
                </span>
              )}
            </label>
            <div className="relative w-full min-w-0">
              <Hash className="w-4 h-4 sm:w-5 sm:h-5 absolute left-3.5 top-3.5 text-gray-500" />
              <input
                type="number"
                required
                min={minLimit}
                max={maxLimit}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-full min-w-0 pl-10 sm:pl-11 pr-4 py-3 rounded-xl glass-input text-xs sm:text-sm font-bold box-border"
              />
            </div>
          </div>

          {/* Quantity Limit Validation Warning Banner */}
          {currentService && isQuantityTooLow && (
            <div className="p-3.5 sm:p-4 rounded-2xl bg-yt-red/15 border border-yt-red/40 text-yt-red text-xs font-bold flex items-center gap-2 w-full max-w-full box-border">
              <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
              <span>
                Quantity ({quantity}) is below minimum limit ({minLimit.toLocaleString()}).
              </span>
            </div>
          )}

          {currentService && isQuantityTooHigh && (
            <div className="p-3.5 sm:p-4 rounded-2xl bg-yt-red/15 border border-yt-red/40 text-yt-red text-xs font-bold flex items-center gap-2 w-full max-w-full box-border">
              <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
              <span>
                Quantity ({quantity}) exceeds maximum limit ({maxLimit.toLocaleString()}).
              </span>
            </div>
          )}

          {/* Total Price Calculation Summary Card */}
          <div className="p-3.5 sm:p-5 rounded-2xl bg-gradient-to-r from-dark-800 to-dark-700/60 border border-gray-800 flex flex-row items-center justify-between gap-2 w-full max-w-full box-border overflow-hidden">
            <div>
              <span className="text-[10px] sm:text-xs font-semibold uppercase text-gray-400 block">Calculated Total Cost</span>
              <span className="text-lg sm:text-2xl font-black text-accent-emerald flex items-center gap-0.5 sm:gap-1">
                <DollarSign className="w-4 h-4 sm:w-6 sm:h-6 stroke-[2.5]" />
                {calculatedCost.toFixed(2)}
              </span>
            </div>

            <div className="text-right">
              {user?.isUnlimited ? (
                <span className="text-[11px] sm:text-xs font-bold text-accent-cyan flex items-center gap-1 justify-end">
                  <CheckCircle2 className="w-3.5 h-3.5 text-accent-cyan shrink-0" /> Unlimited (Free)
                </span>
              ) : (
                <span className={`text-[11px] sm:text-xs font-bold flex items-center gap-1 justify-end ${isBalanceSufficient ? 'text-accent-emerald' : 'text-yt-red'}`}>
                  {isBalanceSufficient ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-accent-emerald shrink-0" /> Balance Ready (${user?.balance?.toFixed(2)})
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3.5 h-3.5 text-yt-red shrink-0" /> Low Balance (${user?.balance?.toFixed(2)})
                    </>
                  )}
                </span>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting || !isBalanceSufficient || isQuantityInvalid}
            className={`w-full py-3.5 sm:py-4 px-4 sm:px-6 rounded-2xl font-extrabold text-xs sm:text-sm uppercase tracking-wider shadow-glow transition-all flex items-center justify-center gap-2 box-border ${
              isBalanceSufficient && !isQuantityInvalid
                ? 'bg-gradient-to-r from-yt-red to-yt-darkRed hover:from-yt-lightRed hover:to-yt-red text-white cursor-pointer'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
            }`}
          >
            {submitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                <span>Submit Order (${calculatedCost.toFixed(2)})</span>
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
};

export default NewOrder;
