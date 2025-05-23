// AuthContext.js
import React, { createContext, useState, useContext, useEffect } from "react";
import { jwtDecode } from "jwt-decode";

export const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState({
    user: null,
    role: null,
    loading: true // Add loading state
  });

  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        setAuthState({ user: null, role: null, loading: false });
        return;
      }

      try {
        const decoded = jwtDecode(token);
        setAuthState({
          user: decoded,
          role: decoded.role || 'user',
          loading: false
        });
      } catch (error) {
        console.error("Invalid token:", error);
        localStorage.removeItem("token");
        setAuthState({ user: null, role: null, loading: false });
      }
    };

    initializeAuth();
  }, []);

  const login = (token) => {
    if (typeof token !== 'string') {
      console.error('Invalid token type:', token);
      throw new Error('Invalid token provided');
    }

    try {
      const decoded = jwtDecode(token);
      localStorage.setItem("token", token);
      setAuthState({
        user: decoded,
        role: decoded.role || 'user',
        loading: false
      });
      return true;
    } catch (error) {
      console.error("Token decoding failed:", error);
      localStorage.removeItem("token");
      setAuthState({ user: null, role: null, loading: false });
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setAuthState({ user: null, role: null, loading: false });
  };

  return (
    <AuthContext.Provider value={{ ...authState, login, logout }}>
      {!authState.loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
export default AuthProvider;