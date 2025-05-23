import React, { useContext } from "react";
import { Button, Nav } from "react-bootstrap";
import { Link, useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { FiHome, FiPackage, FiClipboard, FiRefreshCw, FiLogOut, FiLogIn, FiUserPlus } from "react-icons/fi";
import "../styles/Layout.css";

const Sidebar = () => {
  const { user, logout } = useContext(AuthContext);
  const location = useLocation();

  // Check if current route matches
  const isActive = (path) => location.pathname === path;

  // Safe user data access
  const username = user?.username || '';
  const userRole = user?.role || 'User';
  const firstInitial = username.charAt(0).toUpperCase() || 'U';

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2 className="app-title">
          <span className="app-icon">📦</span>
          Inventory Pro
        </h2>
      </div>

      <Nav className="flex-column sidebar-nav">
        <Nav.Item>
          <Nav.Link 
            as={Link} 
            to="/" 
            active={isActive('/')}
            className="nav-link-item"
          >
            <FiHome className="nav-icon" />
            <span>Dashboard</span>
          </Nav.Link>
        </Nav.Item>
        
        {user && (
          <>
            <Nav.Item>
              <Nav.Link 
                as={Link} 
                to="/inventory" 
                active={isActive('/inventory')}
                className="nav-link-item"
              >
                <FiPackage className="nav-icon" />
                <span>Inventory</span>
              </Nav.Link>
            </Nav.Item>
            
            <Nav.Item>
              <Nav.Link 
                as={Link} 
                to="/counting" 
                active={isActive('/counting')}
                className="nav-link-item"
              >
                <FiClipboard className="nav-icon" />
                <span>Stock Counting</span>
              </Nav.Link>
            </Nav.Item>
            
            <Nav.Item>
              <Nav.Link 
                as={Link} 
                to="/refill" 
                active={isActive('/refill')}
                className="nav-link-item"
              >
                <FiRefreshCw className="nav-icon" />
                <span>Refill Management</span>
              </Nav.Link>
            </Nav.Item>
          </>
        )}
      </Nav>

      <div className="sidebar-footer">
        {user ? (
          <div className="user-section">
            <div className="user-info">
              <div className="user-avatar">
                {firstInitial}
              </div>
              <div className="user-details">
                <span className="username">{username || 'Guest'}</span>
                <span className="user-role">{userRole}</span>
              </div>
            </div>
            <Button 
              variant="outline-light" 
              className="logout-btn"
              onClick={logout}
            >
              <FiLogOut className="btn-icon" />
              Logout
            </Button>
          </div>
        ) : (
          <div className="auth-section">
            <Button 
              as={Link} 
              to="/login" 
              variant="primary" 
              className="auth-btn"
            >
              <FiLogIn className="btn-icon" />
              Login
            </Button>
            <Button 
              as={Link} 
              to="/signup" 
              variant="outline-light" 
              className="auth-btn mt-2"
            >
              <FiUserPlus className="btn-icon" />
              Sign Up
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;