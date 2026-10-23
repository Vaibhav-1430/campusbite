import React from 'react';
import { Navbar } from '../../components/common/Navbar.js';
import { useAuth } from '../../context/AuthContext.js';
import { ShoppingCart, Clock } from 'lucide-react';

export const CounterShellPage: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm max-w-2xl mx-auto text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-sm">
            <ShoppingCart className="w-8 h-8" />
          </div>

          <h1 className="text-2xl font-bold text-slate-900">
            Welcome to Counter Terminal, {user?.name}
          </h1>

          <p className="text-slate-500 text-sm max-w-md mx-auto">
            You are signed in with the <span className="font-semibold text-blue-600">COUNTER</span> role.
            Your authentication session is verified and active.
          </p>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-left text-xs text-slate-600 space-y-1">
            <div className="flex items-center space-x-2 font-medium text-slate-700">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>Shift Information & Next Phase Readiness</span>
            </div>
            <p>• Authentication & session revocation active</p>
            <p>• POS menu catalog, touch cart, and order generation scheduled for Phase 2</p>
          </div>
        </div>
      </main>
    </div>
  );
};
