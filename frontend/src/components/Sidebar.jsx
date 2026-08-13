import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  ShoppingCart,
  History,
  CreditCard,
  Users,
  Layers,
  FileCheck,
  Settings,
  ShieldCheck,
  Globe,
  X,
  Youtube,
} from 'lucide-react';

const Sidebar = ({ mobileMenuOpen, setMobileMenuOpen }) => {
  const { isAdmin } = useAuth();

  const userLinks = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'New Order', path: '/new-order', icon: ShoppingCart },
    { name: 'Order History', path: '/orders', icon: History },
    { name: 'Add Funds', path: '/add-funds', icon: CreditCard },
    { name: 'Services', path: isAdmin ? '/admin/services' : '/new-order', icon: Layers },
  ];

  const adminLinks = [
    { name: 'Overview', path: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'API Providers (v2)', path: '/admin/providers', icon: Globe },
    { name: 'Users Control', path: '/admin/users', icon: Users },
    { name: 'Services CRUD', path: '/admin/services', icon: Layers },
    { name: 'All Orders Sync', path: '/admin/orders', icon: FileCheck },
    { name: 'Settings', path: '/admin/settings', icon: Settings },
  ];

  const handleLinkClick = () => {
    if (setMobileMenuOpen) {
      setMobileMenuOpen(false);
    }
  };

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
      isActive
        ? 'bg-gradient-to-r from-yt-red to-yt-darkRed text-white shadow-glow'
        : 'text-gray-400 hover:text-white hover:bg-dark-700/60'
    }`;

  const renderNavContent = () => (
    <>
      {/* User Section */}
      <div>
        <h3 className="px-3 text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
          Client Portal
        </h3>
        <nav className="flex flex-col gap-1">
          {userLinks.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.name + link.path}
                to={link.path}
                className={linkClass}
                onClick={handleLinkClick}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{link.name}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Admin Section (Restricted) */}
      {isAdmin && (
        <div className="pt-4 border-t border-gray-800">
          <div className="px-3 flex items-center justify-between mb-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-yt-red flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-yt-red" />
              Admin Controls
            </h3>
            <span className="text-[9px] bg-yt-red/20 text-yt-red font-bold px-1.5 py-0.5 rounded">
              ADMIN
            </span>
          </div>
          <nav className="flex flex-col gap-1">
            {adminLinks.map((link) => {
              const Icon = link.icon;
              return (
                <NavLink
                  key={link.path}
                  to={link.path}
                  className={linkClass}
                  onClick={handleLinkClick}
                >
                  <Icon className="w-4 h-4 shrink-0 text-accent-cyan" />
                  <span>{link.name}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 glass-card border-r border-gray-800/80 p-4 shrink-0 flex-col gap-6">
        {renderNavContent()}
      </aside>

      {/* Mobile Slide-Out Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop Overlay */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Slide-out Panel */}
          <aside className="fixed top-0 left-0 bottom-0 w-72 bg-dark-800 border-r border-gray-800/90 p-5 flex flex-col gap-6 shadow-2xl z-50 overflow-y-auto animate-in slide-in-from-left duration-200">
            {/* Mobile Header with Brand & Close Button */}
            <div className="flex items-center justify-between border-b border-gray-800/80 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-yt-red to-yt-darkRed flex items-center justify-center shadow-glow">
                  <Youtube className="w-5 h-5 text-white fill-white" />
                </div>
                <div>
                  <span className="text-lg font-extrabold text-white flex items-center gap-1">
                    Tube<span className="text-yt-red">Boost</span>
                  </span>
                  <span className="text-[10px] text-gray-400 block -mt-1 font-medium">Mobile Navigation</span>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg bg-dark-700 text-gray-400 hover:text-white hover:bg-dark-600 transition-all"
                aria-label="Close Mobile Drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {renderNavContent()}
          </aside>
        </div>
      )}
    </>
  );
};

export default Sidebar;
