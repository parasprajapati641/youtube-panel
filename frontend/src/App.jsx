import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import UserDashboard from './pages/UserDashboard';
import NewOrder from './pages/NewOrder';
import OrderHistory from './pages/OrderHistory';
import AddFunds from './pages/AddFunds';

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard';
import ProviderManagement from './pages/admin/ProviderManagement';
import UserManagement from './pages/admin/UserManagement';
import ServiceManagement from './pages/admin/ServiceManagement';
import OrderManagement from './pages/admin/OrderManagement';
import Settings from './pages/admin/Settings';

const Layout = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-dark-900">
      <Navbar />
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col md:flex-row gap-6">
        <Sidebar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1A1D2A',
            color: '#fff',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
          },
        }}
      />
      <Routes>
        {/* Public Auth Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* User Protected Routes */}
        <Route element={<ProtectedRoute />}>
          <Route
            path="/dashboard"
            element={
              <Layout>
                <UserDashboard />
              </Layout>
            }
          />
          <Route
            path="/new-order"
            element={
              <Layout>
                <NewOrder />
              </Layout>
            }
          />
          <Route
            path="/orders"
            element={
              <Layout>
                <OrderHistory />
              </Layout>
            }
          />
          <Route
            path="/add-funds"
            element={
              <Layout>
                <AddFunds />
              </Layout>
            }
          />
        </Route>

        {/* Admin Protected Routes */}
        <Route element={<AdminRoute />}>
          <Route
            path="/admin/dashboard"
            element={
              <Layout>
                <AdminDashboard />
              </Layout>
            }
          />
          <Route
            path="/admin/providers"
            element={
              <Layout>
                <ProviderManagement />
              </Layout>
            }
          />
          <Route
            path="/admin/users"
            element={
              <Layout>
                <UserManagement />
              </Layout>
            }
          />
          <Route
            path="/admin/services"
            element={
              <Layout>
                <ServiceManagement />
              </Layout>
            }
          />
          <Route
            path="/admin/orders"
            element={
              <Layout>
                <OrderManagement />
              </Layout>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <Layout>
                <Settings />
              </Layout>
            }
          />
        </Route>

        {/* Fallback Redirect */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
