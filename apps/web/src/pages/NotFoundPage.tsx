import React from 'react';
import { Link } from 'react-router-dom';
import { UtensilsCrossed } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-orange-600 flex items-center justify-center text-white shadow-md mb-4">
        <UtensilsCrossed className="w-8 h-8" />
      </div>
      <h1 className="text-3xl font-bold text-slate-900">404 - Page Not Found</h1>
      <p className="mt-2 text-sm text-slate-500 max-w-sm">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        to="/login"
        className="mt-6 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 transition-colors shadow-sm"
      >
        Return to Portal
      </Link>
    </div>
  );
};
