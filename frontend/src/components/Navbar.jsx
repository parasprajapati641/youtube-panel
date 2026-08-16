import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Youtube, Wallet, LogOut, ShieldAlert, Sparkles, PlusCircle, Menu, X, RefreshCw } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';

const Navbar = ({ mobileMenuOpen, setMobileMenuOpen }) => {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [smmShibaBalance, setSmmShibaBalance] = useState(null);

  useEffect(() => {
    if (user && isAdmin) {
      const fetchBalance = async () => {
        try {
          const res = await api.get('/admin/smmshiba/balance');
          if (res.data && res.data.balance !== undefined) {
            setSmmShibaBalance(res.data.balance);
          }
        } catch (err) {
          console.error('Failed to fetch SMMShiba balance', err);
        }
      };
      fetchBalance();
      const interval = setInterval(fetchBalance, 60000);
      return () => clearInterval(interval);
    }
  }, [user, isAdmin]);

  return (
    <header className="sticky top-0 z-40 w-full max-w-full overflow-x-hidden glass-card border-b border-gray-800/80 bg-dark-800/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between w-full max-w-full overflow-x-hidden box-border">
        
        {/* Left Section: Mobile Hamburger Toggle + Brand Logo */}
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 shrink">
          {user && (
            <button
              onClick={() => setMobileMenuOpen?.(!mobileMenuOpen)}
              className="p-1.5 sm:p-2 rounded-xl bg-dark-700/80 text-gray-300 hover:text-white hover:bg-dark-600 border border-gray-700/70 transition-all md:hidden shrink-0"
              aria-label="Toggle Navigation Drawer"
            >
              {mobileMenuOpen ? <X className="w-4 h-4 sm:w-5 sm:h-5 text-yt-red" /> : <Menu className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>
          )}

          <Link to={isAdmin ? "/admin/dashboard" : "/dashboard"} className="flex items-center gap-1.5 sm:gap-2.5 group min-w-0">
            <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-yt-red to-yt-darkRed flex items-center justify-center shadow-glow group-hover:scale-105 transition-transform shrink-0">
              <Youtube className="w-4 h-4 sm:w-5 sm:h-5 text-white fill-white" />
            </div>
            <div className="min-w-0 flex items-center gap-1">
              <span className="text-sm sm:text-lg font-extrabold tracking-tight text-white flex items-center gap-0.5 sm:gap-1.5 whitespace-nowrap">
                Tube<span className="text-yt-red">Boost</span>
              </span>
              <span className="hidden xs:inline-block text-[8px] sm:text-[10px] uppercase font-bold tracking-widest px-1 py-0.2 sm:px-1.5 sm:py-0.5 rounded bg-yt-red/10 text-yt-red border border-yt-red/20 shrink-0">
                PRO
              </span>
            </div>
          </Link>
        </div>

        {/* User Balance & Role Controls */}
        {user && (
          <div className="flex items-center gap-1 sm:gap-3 shrink-0 ml-auto">
            
            {/* Live SMMShiba API Balance for Admin */}
            {isAdmin && smmShibaBalance !== null && (
              <div className="hidden sm:flex items-center gap-1.5 bg-dark-900/90 px-2.5 py-1 rounded-xl border border-accent-cyan/30 text-[11px] font-semibold text-accent-cyan shadow-glow-cyan">
                <span className="w-2 h-2 rounded-full bg-accent-cyan animate-pulse"></span>
                <span className="text-gray-400 text-xs hidden lg:inline">SMMShiba API:</span>
                <span className="font-bold font-mono">${smmShibaBalance.toFixed(2)}</span>
              </div>
            )}

            {/* Unlimited Test Account Badge */}
            {user.isUnlimited ? (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-accent-purple/20 to-accent-cyan/20 border border-accent-purple/40 text-accent-cyan text-[11px] sm:text-xs font-semibold shadow-glow-cyan animate-pulse">
                <Sparkles className="w-3.5 h-3.5 text-accent-cyan shrink-0" />
                <span className="hidden md:inline">Unlimited Admin Mode</span>
                <span className="md:hidden">Unlimited</span>
              </div>
            ) : (
              /* User Balance Display */
              <div className="flex items-center gap-1 bg-dark-900/80 px-1.5 py-1 sm:px-3 sm:py-1.5 rounded-xl border border-gray-800 text-[11px] sm:text-sm font-semibold">
                <Wallet className="w-3 h-3 sm:w-4 sm:h-4 text-accent-emerald shrink-0" />
                <span className="text-gray-400 text-xs hidden md:inline">Balance:</span>
                <span className="text-accent-emerald font-bold text-xs sm:text-sm">${(user.balance || 0).toFixed(2)}</span>
                <button
                  onClick={() => navigate('/add-funds')}
                  title="Add Funds"
                  className="ml-0.5 text-gray-400 hover:text-white transition-colors flex items-center"
                >
                  <PlusCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yt-red hover:scale-110 transition-transform" />
                </button>
              </div>
            )}

            {/* Role Badge (Hidden on small viewports, visible on md and up) */}
            <span
              className={`hidden md:inline-flex text-xs uppercase font-bold px-2.5 py-1 rounded-lg border ${
                isAdmin
                  ? 'bg-yt-red/15 text-yt-red border-yt-red/30 flex items-center gap-1'
                  : 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20'
              }`}
            >
              {isAdmin && <ShieldAlert className="w-3 h-3" />}
              {user.role}
            </span>

            {/* User Avatar & Logout */}
            <div className="flex items-center gap-1 sm:gap-1.5 pl-1 sm:pl-2 border-l border-gray-800/80">
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-tr from-gray-700 to-gray-600 flex items-center justify-center font-bold text-[10px] sm:text-xs uppercase text-white shadow-inner shrink-0">
                {user.username?.charAt(0) || 'U'}
              </div>
              <button
                onClick={logout}
                title="Logout"
                className="p-1 sm:p-1.5 rounded-lg text-gray-400 hover:text-yt-red hover:bg-yt-red/10 transition-all shrink-0"
              >
                <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;
