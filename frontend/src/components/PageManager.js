import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import HomePage from "../pages/Homepage";
import InventoryPage from "../pages/InventoryPage";
import NotFound from "../pages/NotFound";
import "../styles/Global.css"; 

const PageManager = () => {
  return (
    <Router>
      <div className="app-layout">
        <Sidebar />
        <div className="main-content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
};

export default PageManager;
