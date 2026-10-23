import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Role } from '@campusbite/shared';
import { AuthProvider } from './context/AuthContext.js';
import { ProtectedRoute } from './components/common/ProtectedRoute.js';
import { LoginPage } from './pages/LoginPage.js';
import { CustomerTrackingPage } from './pages/tracking/CustomerTrackingPage.js';
import { PublicDisplayBoardPage } from './pages/display/PublicDisplayBoardPage.js';
import { AdminStaffPage } from './pages/admin/AdminStaffPage.js';
import { AdminMenuPage } from './pages/admin/AdminMenuPage.js';
import { CounterPOSPage } from './pages/counter/CounterPOSPage.js';
import { KitchenKDSPage } from './pages/kitchen/KitchenKDSPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Customer & Cafeteria Routes */}
          <Route path="/" element={<Navigate to="/track" replace />} />
          <Route path="/track" element={<CustomerTrackingPage />} />
          <Route path="/track/:orderNumber" element={<CustomerTrackingPage />} />
          <Route path="/board" element={<PublicDisplayBoardPage />} />
          <Route path="/display" element={<Navigate to="/board" replace />} />

          {/* Staff Auth Route */}
          <Route path="/login" element={<LoginPage />} />

          {/* Admin Protected Routes */}
          <Route path="/admin" element={<Navigate to="/admin/menu" replace />} />
          <Route
            path="/admin/menu"
            element={
              <ProtectedRoute allowedRoles={[Role.ADMIN]}>
                <AdminMenuPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/staff"
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
                <CounterPOSPage />
              </ProtectedRoute>
            }
          />

          {/* Kitchen Protected Routes */}
          <Route
            path="/kitchen"
            element={
              <ProtectedRoute allowedRoles={[Role.KITCHEN, Role.ADMIN]}>
                <KitchenKDSPage />
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
