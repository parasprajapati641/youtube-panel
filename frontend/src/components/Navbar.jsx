import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Youtube, Wallet, LogOut, ShieldAlert, Sparkles, PlusCircle, Menu, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const Navbar = ({ mobileMenuOpen, setMobileMenuOpen }) => {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 w-full glass-card border-b border-gray-800/80 bg-dark-800/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Left Section: Mobile Hamburger Toggle + Brand Logo */}
        <div className="flex items-center gap-3">
          {user && (
            <button
              onClick={() => setMobileMenuOpen?.(!mobileMenuOpen)}
              className="p-2 rounded-xl bg-dark-700/80 text-gray-300 hover:text-white hover:bg-dark-600 border border-gray-700/70 transition-all md:hidden"
              aria-label="Toggle Navigation Drawer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5 text-yt-red" /> : <Menu className="w-5 h-5" />}
            </button>
          )}

          <Link to={isAdmin ? "/admin/dashboard" : "/dashboard"} className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yt-red to-yt-darkRed flex items-center justify-center shadow-glow group-hover:scale-105 transition-transform">
              <Youtube className="w-6 h-6 text-white fill-white" />
            </div>
            <div>
              <span className="text-xl font-extrabold tracking-tight text-white flex items-center gap-1.5">
                Tube<span className="text-yt-red">Boost</span>
                <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-yt-red/10 text-yt-red border border-yt-red/20">
                  PRO
                </span>
              </span>
              <span className="text-[11px] text-gray-400 block -mt-1 font-medium">SMM Growth Engine</span>
            </div>
          </Link>
        </div>

        {/* User Balance & Role Controls */}
        {user && (
          <div className="flex items-center gap-3 sm:gap-4">
            
            {/* Unlimited Test Account Badge */}
            {user.isUnlimited ? (
              <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-accent-purple/20 to-accent-cyan/20 border border-accent-purple/40 text-accent-cyan text-xs font-semibold shadow-glow-cyan animate-pulse">
                <Sparkles className="w-3.5 h-3.5 text-accent-cyan" />
                <span>Unlimited Admin Mode</span>
              </div>
            ) : (
              /* User Balance Display */
              <div className="flex items-center gap-2 bg-dark-900/80 px-3.5 py-1.5 rounded-xl border border-gray-800 text-sm font-semibold">
                <Wallet className="w-4 h-4 text-accent-emerald" />
                <span className="text-gray-400 text-xs hidden sm:inline">Balance:</span>
                <span className="text-accent-emerald text-base font-bold">${(user.balance || 0).toFixed(2)}</span>
                <button
                  onClick={() => navigate('/add-funds')}
                  title="Add Funds"
                  className="ml-1 text-gray-400 hover:text-white transition-colors"
                >
                  <PlusCircle className="w-4 h-4 text-yt-red hover:scale-110 transition-transform" />
                </button>
              </div>
            )}

            {/* Role Badge */}
            <span
              className={`text-xs uppercase font-bold px-2.5 py-1 rounded-lg border ${
                isAdmin
                  ? 'bg-yt-red/15 text-yt-red border-yt-red/30 flex items-center gap-1'
                  : 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20'
              }`}
            >
              {isAdmin && <ShieldAlert className="w-3 h-3" />}
              {user.role}
            </span>

            {/* User Avatar & Logout */}
            <div className="flex items-center gap-2 pl-2 border-l border-gray-800">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-gray-700 to-gray-600 flex items-center justify-center font-bold text-xs uppercase text-white shadow-inner">
                {user.username?.charAt(0) || 'U'}
              </div>
              <button
                onClick={logout}
                title="Logout"
                className="p-2 rounded-lg text-gray-400 hover:text-yt-red hover:bg-yt-red/10 transition-all"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;
