import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://16.179.250.10';

const api = axios.create({
  baseURL: API_BASE_URL+'/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Interceptor to attach JWT auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('smm_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor to handle global 401 (including single-device session expiry)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const code = error.response.data?.code;
      const msg = error.response.data?.message || '';

      // Single device / session expired → force logout
      if (code === 'SESSION_EXPIRED' || msg.includes('another device') || msg.includes('token invalid')) {
        localStorage.removeItem('smm_token');
        // Soft redirect so user sees login page
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
