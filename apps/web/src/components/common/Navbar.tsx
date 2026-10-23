import React from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { Badge } from './Badge.js';
import { LogOut, UtensilsCrossed } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & App Name */}
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-orange-600 flex items-center justify-center text-white shadow-sm">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-lg text-slate-900 tracking-tight">CampusBite</span>
              <span className="hidden sm:inline-block ml-2 text-xs text-slate-500 font-medium">
                Restaurant POS & KDS
              </span>
            </div>
          </div>

          {/* User Info & Actions */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-slate-700 hidden sm:inline-block">
                {user.name}
              </span>
              <Badge role={user.role}>{user.role}</Badge>
            </div>

            <button
              onClick={handleLogout}
              className="inline-flex items-center justify-center p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
