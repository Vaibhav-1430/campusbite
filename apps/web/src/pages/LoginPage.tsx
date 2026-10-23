import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Role, loginSchema } from '@campusbite/shared';
import { useAuth } from '../context/AuthContext.js';
import { ApiError } from '../services/api.js';
import { UtensilsCrossed, AlertCircle, Eye, EyeOff } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login, user } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // If already logged in, redirect to appropriate role portal
  React.useEffect(() => {
    if (user) {
      if (user.role === Role.ADMIN) navigate('/admin');
      else if (user.role === Role.COUNTER) navigate('/counter');
      else if (user.role === Role.KITCHEN) navigate('/kitchen');
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Client-side schema validation
    const validation = loginSchema.safeParse({ email, password });
    if (!validation.success) {
      setErrorMessage(validation.error.errors[0]?.message || 'Invalid input.');
      return;
    }

    try {
      setSubmitting(true);
      const sessionUser = await login({ email: validation.data.email, password });

      if (sessionUser.role === Role.ADMIN) navigate('/admin');
      else if (sessionUser.role === Role.COUNTER) navigate('/counter');
      else if (sessionUser.role === Role.KITCHEN) navigate('/kitchen');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'ACCOUNT_DEACTIVATED') {
          setErrorMessage('Your account has been deactivated. Please contact an administrator.');
        } else if (err.code === 'INVALID_CREDENTIALS') {
          setErrorMessage('Invalid email or password combination.');
        } else if (err.code === 'TOO_MANY_REQUESTS') {
          setErrorMessage('Too many failed attempts. Please try again later.');
        } else {
          setErrorMessage(err.message || 'Login failed.');
        }
      } else {
        setErrorMessage('Unable to connect to server. Please check your network connection.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-slate-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Brand Header */}
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-2xl bg-orange-600 flex items-center justify-center text-white shadow-md">
            <UtensilsCrossed className="w-8 h-8" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          CampusBite Staff Portal
        </h2>
        <p className="mt-1 text-center text-sm text-slate-500">
          Sign in to access your counter, kitchen, or management terminal.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-2xl sm:px-10">
          {errorMessage && (
            <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-start space-x-3 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Staff Email Address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@campusbite.internal"
                  className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent text-sm sm:text-base transition-colors"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="mt-1 relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full px-3.5 py-2.5 pr-10 rounded-lg border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent text-sm sm:text-base transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Signing In...</span>
                  </div>
                ) : (
                  'Sign In'
                )}
              </button>
            </div>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-4 text-center">
            <p className="text-xs text-slate-400">
              CampusBite Internal Restaurant System • Initial Admin Setup Enabled
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
