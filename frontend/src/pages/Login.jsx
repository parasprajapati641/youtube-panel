import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Youtube, Lock, User, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';

const Login = () => {
  const [loginInput, setLoginInput] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!loginInput || !password) return;
    setLoading(true);
    try {
      const user = await login(loginInput, password);
      if (user.role === 'admin') {
        navigate('/admin/dashboard');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      // Error handled by AuthContext toast
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (username, pass) => {
    setLoginInput(username);
    setPassword(pass);
    setLoading(true);
    try {
      const user = await login(username, pass);
      if (user.role === 'admin') {
        navigate('/admin/dashboard');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Ambient Glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-yt-red/15 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-purple/15 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md glass-card rounded-3xl p-8 relative z-10 border border-gray-800 shadow-card">
        {/* Logo */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-yt-red to-yt-darkRed flex items-center justify-center shadow-glow mb-3">
            <Youtube className="w-8 h-8 text-white fill-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            Welcome to Tube<span className="text-yt-red">Boost</span>
          </h1>
          <p className="text-sm text-gray-400 mt-1 font-medium">
            Sign in to access your YouTube SMM Dashboard
          </p>
        </div>

        {/* Quick Demo Credentials Panel */}
        <div className="mb-6 p-3.5 rounded-2xl bg-dark-800/80 border border-gray-800 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-accent-cyan" /> Quick Test Credentials
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickLogin('admin@smm.com', 'Admin@12345')}
              className="px-3 py-2 rounded-xl bg-yt-red/15 hover:bg-yt-red/25 border border-yt-red/30 text-xs font-bold text-yt-red transition-all flex items-center justify-center gap-1"
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Super Admin
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('demo_user', 'userpassword123')}
              className="px-3 py-2 rounded-xl bg-accent-cyan/10 hover:bg-accent-cyan/20 border border-accent-cyan/30 text-xs font-bold text-accent-cyan transition-all flex items-center justify-center gap-1"
            >
              <User className="w-3.5 h-3.5" /> Demo User ($50)
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
              Username or Email
            </label>
            <div className="relative">
              <User className="w-5 h-5 absolute left-3.5 top-3 text-gray-500" />
              <input
                type="text"
                required
                value={loginInput}
                onChange={(e) => setLoginInput(e.target.value)}
                placeholder="Enter username or email"
                className="w-full pl-11 pr-4 py-2.5 rounded-xl glass-input text-sm font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 absolute left-3.5 top-3 text-gray-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-11 pr-4 py-2.5 rounded-xl glass-input text-sm font-medium"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-yt-red to-yt-darkRed hover:from-yt-lightRed hover:to-yt-red text-white font-bold text-sm shadow-glow transition-all flex items-center justify-center gap-2 group mt-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <span>Sign In to Panel</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        {/* Register Link */}
        <div className="mt-6 text-center text-xs text-gray-400">
          Don't have an account?{' '}
          <Link to="/register" className="text-yt-red font-bold hover:underline">
            Register here
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
