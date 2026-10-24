import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AuthSessionUser, LoginInput } from '@campusbite/shared';
import { apiRequest, setStoredToken, setOnUnauthorized } from '../services/api.js';

interface AuthContextType {
  user: AuthSessionUser | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<AuthSessionUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthSessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiRequest<{ user: AuthSessionUser }>('/auth/me');
      setUser(data.user);
    } catch {
      setStoredToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // When any request receives 401 Unauthorized, automatically clear user state
    setOnUnauthorized(() => {
      setUser(null);
    });

    refreshUser();

    return () => {
      setOnUnauthorized(null);
    };
  }, [refreshUser]);

  const login = async (input: LoginInput): Promise<AuthSessionUser> => {
    const data = await apiRequest<{ user: AuthSessionUser; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input)
    });
    if (data.token) {
      setStoredToken(data.token);
    }
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    // Clear staff cart on logout to prevent cart leaking across sessions
    if (user?.id) {
      try {
        localStorage.removeItem(`cafe47_counter_cart_${user.id}`);
      } catch {}
    }
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch (err) {
      console.warn('Logout request failed or already logged out', err);
    } finally {
      setStoredToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
