'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { getAccessToken, setAccessToken, clearAccessToken } from '@/lib/auth';
import { API_BASE_URL } from '@/lib/constants';
import { jwtDecode } from 'jwt-decode';

interface UserType {
  sub: number;
  email: string;
  name: string;
  role: string | null;
}

type AuthContextType = {
  accessToken: string | null;
  user: UserType | null;
  login: (token: string) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [accessToken, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserType | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      try {
        const decoded = jwtDecode<UserType>(token);
        setToken(token);
        setUser(decoded);
      } catch (error) {
        console.error('Failed to decode token:', error);
        clearAccessToken(); // Purge invalid token from localStorage
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onTokenUpdate = (event: Event) => {
      const e = event as CustomEvent<{ accessToken: string | null }>;
      const nextToken = e.detail?.accessToken ?? null;

      setToken(nextToken);
      if (!nextToken) {
        setUser(null);
        return;
      }

      try {
        const decoded = jwtDecode<UserType>(nextToken);
        setUser(decoded);
      } catch (error) {
        console.error('Failed to decode updated token:', error);
        clearAccessToken();
        setToken(null);
        setUser(null);
      }
    };

    window.addEventListener('auth:accessToken', onTokenUpdate as EventListener);
    return () => window.removeEventListener('auth:accessToken', onTokenUpdate as EventListener);
  }, []);

  const login = (token: string) => {
    try {
      const decoded = jwtDecode<UserType>(token);
      setAccessToken(token);
      setToken(token);
      setUser(decoded);
    } catch (error) {
      console.error('Failed to decode token during login:', error);
    }
  };

  const logout = async () => {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout failed:', error);
    }

    clearAccessToken();
    setToken(null);
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ accessToken, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
