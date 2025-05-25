import React, { useContext } from "react";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import InventoryTable from "./components/InventoryTable";
import Auth from "./components/Auth";
import AuthProvider, { AuthContext } from "./context/AuthContext";
import PageManager from "./components/PageManager";
import Refill from "./components/Refill";
import Counting from "./components/Counting";
import CreateFirstAdmin from './components/CreateFirstAdmin';
import Dashboard from "./components/Dashboard"; // Add Dashboard import

const PrivateRoute = ({ element }) => {
  const { user } = useContext(AuthContext);
  return user ? element : <Navigate to="/login" />;
};

const App = () => {
  return (
    <AuthProvider>
      <Router>
        <div className="app-container">
          <AuthContext.Consumer>
            {({ user }) => user && <Sidebar />}
          </AuthContext.Consumer>

          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" />} /> {/* Update default redirect */}
            <Route path="/login" element={<Auth type="login" />} />
            <Route path="/signup" element={<Auth type="signup" />} />
            
            {/* Protected Routes */}
            <Route path="/dashboard" element={<PrivateRoute element={<Dashboard />} />} />
            <Route path="/inventory" element={<PrivateRoute element={<InventoryTable />} />} />
            <Route path="/manage" element={<PrivateRoute element={<PageManager />} />} />
            <Route path="/refill" element={<PrivateRoute element={<Refill />} />} />
            <Route path="/counting" element={<PrivateRoute element={<Counting />} />} />
            <Route path="/create-first-admin" element={<CreateFirstAdmin />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
};

export default App;