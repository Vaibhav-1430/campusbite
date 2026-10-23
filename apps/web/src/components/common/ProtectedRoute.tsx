import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Role } from '@campusbite/shared';
import { useAuth } from '../../context/AuthContext.js';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: Role[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-3 border-orange-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Verifying session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to the user's authorized role home
    if (user.role === Role.ADMIN) return <Navigate to="/admin" replace />;
    if (user.role === Role.COUNTER) return <Navigate to="/counter" replace />;
    if (user.role === Role.KITCHEN) return <Navigate to="/kitchen" replace />;
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};
