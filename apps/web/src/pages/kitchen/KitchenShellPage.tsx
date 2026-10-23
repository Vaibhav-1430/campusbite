import React from 'react';
import { Navbar } from '../../components/common/Navbar.js';
import { useAuth } from '../../context/AuthContext.js';
import { ChefHat, Flame } from 'lucide-react';

export const KitchenShellPage: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm max-w-2xl mx-auto text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto shadow-sm">
            <ChefHat className="w-8 h-8" />
          </div>

          <h1 className="text-2xl font-bold text-slate-900">
            Welcome to Kitchen Display (KDS), {user?.name}
          </h1>

          <p className="text-slate-500 text-sm max-w-md mx-auto">
            You are signed in with the <span className="font-semibold text-amber-600">KITCHEN</span> role.
            Your authentication session is verified and active.
          </p>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-left text-xs text-slate-600 space-y-1">
            <div className="flex items-center space-x-2 font-medium text-slate-700">
              <Flame className="w-4 h-4 text-amber-500" />
              <span>Kitchen Display Terminal Readiness</span>
            </div>
            <p>• Authentication & role boundaries verified</p>
            <p>• Real-time ticket queues, atomic claiming, timers & sound alerts scheduled for Phase 3</p>
          </div>
        </div>
      </main>
    </div>
  );
};
