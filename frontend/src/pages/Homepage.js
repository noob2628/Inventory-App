// src/pages/HomePage.js
import React from "react";
import { Link } from "react-router-dom";

const HomePage = () => {
  return (
    <div>
      <h1>Home Page</h1>
      <Link to="/inventory">Go to Inventory</Link>
    </div>
  );
};

export default HomePage;
