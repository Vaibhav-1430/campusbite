import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { Badge } from './Badge.js';
import { LogOut, UtensilsCrossed, QrCode, Monitor } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { UniversalQrModal } from '../tracking/UniversalQrModal.js';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <>
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
            <div className="flex items-center space-x-2 sm:space-x-3">
              {/* Universal QR Trigger */}
              <button
                type="button"
                onClick={() => setIsQrModalOpen(true)}
                className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:text-orange-600 hover:bg-orange-50 border border-slate-200 transition-colors"
                title="Universal Table & Counter Tracking QR Code"
              >
                <QrCode className="w-3.5 h-3.5 sm:mr-1.5 text-orange-600" />
                <span className="hidden sm:inline">Tracking QR</span>
              </button>

              {/* Cafeteria Board Link */}
              <Link
                to="/board"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors"
                title="Open Public TV Display Board in new tab"
              >
                <Monitor className="w-3.5 h-3.5 sm:mr-1.5 text-slate-600" />
                <span className="hidden sm:inline">TV Board</span>
              </Link>

              <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />

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

      {/* Universal QR Code Modal */}
      <UniversalQrModal isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} />
    </>
  );
};
