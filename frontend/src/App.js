import React, { useContext } from "react";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import InventoryTable from "./components/InventoryTable";
import Auth from "./components/Auth";
import AuthProvider, { AuthContext } from "./context/AuthContext";
import PageManager from "./components/PageManager"; // Import PageManager
import Refill from "./components/Refill"; // ✅ Import Refill Component
import Counting from "./components/Counting"; // ✅ Import Counting Component
import CreateFirstAdmin from './components/CreateFirstAdmin';


const PrivateRoute = ({ element }) => {
  const { user } = useContext(AuthContext);
  return user ? element : <Navigate to="/login" />;
};

const App = () => {
  return (
    <AuthProvider>
      <Router>
        <div className="app-container">
          {/* Show Sidebar only if user is logged in */}
          <AuthContext.Consumer>
            {({ user }) => user && <Sidebar />}
          </AuthContext.Consumer>

          <Routes>
            <Route path="/" element={<Navigate to="/inventory" />} />
            <Route path="/login" element={<Auth type="login" />} />
            <Route path="/signup" element={<Auth type="signup" />} />
            
            {/* Protected Routes */}
            <Route path="/inventory" element={<PrivateRoute element={<InventoryTable />} />} />
            <Route path="/manage" element={<PrivateRoute element={<PageManager />} />} />
            <Route path="/refill" element={<PrivateRoute element={<Refill />} />} />
            <Route path="/counting" element={<PrivateRoute element={<Counting />} />} /> {/* ✅ Added Counting Route */}
            <Route path="/create-first-admin" element={<CreateFirstAdmin />} />
            <Route 
              path="/create-first-admin" 
              element={<Navigate to="/admin/signup" replace />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
};

export default App;
