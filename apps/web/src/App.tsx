import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Role } from '@campusbite/shared';
import { AuthProvider } from './context/AuthContext.js';
import { ProtectedRoute } from './components/common/ProtectedRoute.js';
import { LoginPage } from './pages/LoginPage.js';
import { AdminStaffPage } from './pages/admin/AdminStaffPage.js';
import { CounterShellPage } from './pages/counter/CounterShellPage.js';
import { KitchenShellPage } from './pages/kitchen/KitchenShellPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Admin Protected Routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={[Role.ADMIN]}>
                <AdminStaffPage />
              </ProtectedRoute>
            }
          />

          {/* Counter Protected Routes */}
          <Route
            path="/counter"
            element={
              <ProtectedRoute allowedRoles={[Role.COUNTER, Role.ADMIN]}>
                <CounterShellPage />
              </ProtectedRoute>
            }
          />

          {/* Kitchen Protected Routes */}
          <Route
            path="/kitchen"
            element={
              <ProtectedRoute allowedRoles={[Role.KITCHEN, Role.ADMIN]}>
                <KitchenShellPage />
              </ProtectedRoute>
            }
          />

          {/* 404 Route */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
