import React, { createContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { getDeviceId } from "./api";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser]     = useState(null);
  const [token, setToken]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        /* userData (non-sensitive) stays in AsyncStorage */
        const stored = await AsyncStorage.getItem("userData");
        /* JWT token lives in SecureStore (encrypted on device) */
        const storedToken = await SecureStore.getItemAsync("userToken");
        if (stored)      setUser(JSON.parse(stored));
        if (storedToken) setToken(storedToken);
      } catch (e) {
        console.warn("Failed to load auth data:", e);
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, []);

  const login = async (userData, jwtToken) => {
    setUser(userData);
    setToken(jwtToken);
    await AsyncStorage.setItem("userData", JSON.stringify(userData));
    await SecureStore.setItemAsync("userToken", jwtToken);
  };

  const logout = async () => {
    setUser(null);
    setToken(null);
    await AsyncStorage.removeItem("userData");
    await SecureStore.deleteItemAsync("userToken");
  };

  const updateUser = async (updated) => {
    setUser(updated);
    await AsyncStorage.setItem("userData", JSON.stringify(updated));
  };

  // authHeaders — sync version for legacy callers.
  // For fresh nonce+timestamp, prefer apiFetch() from api.js instead.
  const authHeaders = (extra = {}) => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  });

  // authHeadersAsync — full security headers including device ID, timestamp, nonce
  const authHeadersAsync = async (extra = {}) => {
    const deviceId = await getDeviceId();
    return {
      "Content-Type" : "application/json",
      "X-Device-Id"  : deviceId,
      "X-Timestamp"  : String(Date.now()),
      "X-Nonce"      : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    };
  };

  return (
    <AuthContext.Provider
      value={{ user, token, login, logout, updateUser, loading, authHeaders, authHeadersAsync }}
    >
      {children}
    </AuthContext.Provider>
  );
};