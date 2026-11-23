import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { getDeviceId, getDeviceInfo } from '../utils/device';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('smm_token') || null);
  const [loading, setLoading] = useState(true);

  // Load current user profile if token exists
  const loadUser = async () => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await api.get('/auth/me');
      setUser(res.data);
    } catch (error) {
      console.error('Failed to load user:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser();
  }, [token]);

  const login = async (loginIdentifier, password) => {
    try {
      const deviceId = getDeviceId();
      const deviceInfo = getDeviceInfo();
      const res = await api.post('/auth/login', {
        login: loginIdentifier,
        password,
        deviceId,
        deviceInfo,
      });
      const { token: authToken, user: userData } = res.data;
      localStorage.setItem('smm_token', authToken);
      setToken(authToken);
      setUser(userData);
      toast.success(`Welcome back, ${userData.username}!`);
      return userData;
    } catch (error) {
      const code = error.response?.data?.code;
      const msg =
        error.response?.data?.message || 'Login failed. Please check your credentials.';
      if (code === 'DEVICE_LOCKED') {
        toast.error(msg, { duration: 6000 });
      } else {
        toast.error(msg);
      }
      throw error;
    }
  };

  const register = async (username, email, password) => {
    try {
      const deviceId = getDeviceId();
      const deviceInfo = getDeviceInfo();
      const res = await api.post('/auth/register', {
        username,
        email,
        password,
        deviceId,
        deviceInfo,
      });
      const { token: authToken, user: userData } = res.data;
      localStorage.setItem('smm_token', authToken);
      setToken(authToken);
      setUser(userData);
      toast.success('Registration successful! Welcome to TubeBoost.');
      return userData;
    } catch (error) {
      const msg = error.response?.data?.message || 'Registration failed.';
      toast.error(msg);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('smm_token');
    setToken(null);
    setUser(null);
    toast.success('Logged out successfully');
  };

  const refreshUser = async () => {
    if (!token) return;
    try {
      const res = await api.get('/auth/me');
      setUser(res.data);
    } catch (err) {
      console.error('Error refreshing user:', err);
    }
  };

  const updateBalance = (newBalance) => {
    if (user) {
      setUser((prev) => ({ ...prev, balance: newBalance }));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        logout,
        refreshUser,
        updateBalance,
        isAdmin: user?.role === 'admin' || user?.role === 'super_admin',
        isSuperAdmin: user?.role === 'super_admin',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
