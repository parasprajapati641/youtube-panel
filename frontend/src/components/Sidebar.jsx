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
} from 'lucide-react';

const Sidebar = () => {
  const { isAdmin } = useAuth();

  const userLinks = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'New Order', path: '/new-order', icon: ShoppingCart },
    { name: 'Order History', path: '/orders', icon: History },
    { name: 'Add Funds', path: '/add-funds', icon: CreditCard },
  ];

  const adminLinks = [
    { name: 'Overview', path: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'API Providers (v2)', path: '/admin/providers', icon: Globe },
    { name: 'Users Control', path: '/admin/users', icon: Users },
    { name: 'Services CRUD', path: '/admin/services', icon: Layers },
    { name: 'All Orders Sync', path: '/admin/orders', icon: FileCheck },
    { name: 'Settings', path: '/admin/settings', icon: Settings },
  ];

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
      isActive
        ? 'bg-gradient-to-r from-yt-red to-yt-darkRed text-white shadow-glow'
        : 'text-gray-400 hover:text-white hover:bg-dark-700/60'
    }`;

  return (
    <aside className="w-full md:w-64 glass-card border-r border-gray-800/80 p-4 shrink-0 flex flex-col gap-6">
      {/* User Section */}
      <div>
        <h3 className="px-3 text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
          Client Portal
        </h3>
        <nav className="flex flex-col gap-1">
          {userLinks.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink key={link.path} to={link.path} className={linkClass}>
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
                <NavLink key={link.path} to={link.path} className={linkClass}>
                  <Icon className="w-4 h-4 shrink-0 text-accent-cyan" />
                  <span>{link.name}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
