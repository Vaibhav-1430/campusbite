import React from 'react';
import { Role } from '@campusbite/shared';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'role';
  role?: Role;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'neutral', role, className = '' }) => {
  let styleClasses = 'bg-slate-100 text-slate-700 border-slate-200';

  if (role) {
    switch (role) {
      case Role.ADMIN:
        styleClasses = 'bg-purple-50 text-purple-700 border-purple-200';
        break;
      case Role.COUNTER:
        styleClasses = 'bg-blue-50 text-blue-700 border-blue-200';
        break;
      case Role.KITCHEN:
        styleClasses = 'bg-amber-50 text-amber-700 border-amber-200';
        break;
    }
  } else {
    switch (variant) {
      case 'primary':
        styleClasses = 'bg-orange-50 text-orange-700 border-orange-200';
        break;
      case 'success':
        styleClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        break;
      case 'warning':
        styleClasses = 'bg-amber-50 text-amber-700 border-amber-200';
        break;
      case 'danger':
        styleClasses = 'bg-rose-50 text-rose-700 border-rose-200';
        break;
      case 'neutral':
      default:
        styleClasses = 'bg-slate-100 text-slate-700 border-slate-200';
        break;
    }
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styleClasses} ${className}`}
    >
      {children}
    </span>
  );
};
