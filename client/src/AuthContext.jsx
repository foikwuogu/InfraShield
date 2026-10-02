import React, { createContext, useContext, useState, useCallback } from 'react';
import { api } from './api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('infrashield_user');
    if (!stored) return null;
    try {
      const parsed = JSON.parse(stored);
      if (parsed.auth_version === 2) return parsed;
    } catch {
      // Clear malformed or obsolete local sessions before returning to sign-in.
    }
    localStorage.removeItem('infrashield_user');
    localStorage.removeItem('infrashield_token');
    return null;
  });

  const saveSession = useCallback(({ token, user: loggedInUser }) => {
    localStorage.setItem('infrashield_token', token);
    localStorage.setItem('infrashield_user', JSON.stringify(loggedInUser));
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const login = useCallback(async (identifier, password, verification) => {
    const result = await api.login(identifier, password, verification);
    if (result.token) saveSession(result);
    return result;
  }, [saveSession]);

  const completePasswordChange = useCallback(async (token, currentPassword, newPassword) => {
    const result = await api.changePassword(token, currentPassword, newPassword);
    return saveSession(result);
  }, [saveSession]);

  const logout = useCallback(() => {
    localStorage.removeItem('infrashield_token');
    localStorage.removeItem('infrashield_user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, completePasswordChange }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
