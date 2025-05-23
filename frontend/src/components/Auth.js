import React, { useState, useContext, useEffect } from "react";
import { Form, Button, Container, Card, Row, Col, Alert, Spinner } from "react-bootstrap";
import axios from "axios";
import { AuthContext } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { FaUser, FaEnvelope, FaLock, FaSignInAlt, FaUserPlus } from "react-icons/fa";
import "../styles/Auth.css";

// API configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
const LOGIN_ENDPOINT = `${API_BASE_URL}/auth/login`;
const SIGNUP_ENDPOINT = `${API_BASE_URL}/auth/signup`;

const Auth = ({ type }) => {
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  useEffect(() => {
    setError("");
  }, [type]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Update the handleSubmit function
  // Auth.js - Updated handleSubmit function
  const handleSubmit = async (e) => {
  e.preventDefault();
  setError("");
  setLoading(true);

  try {
    // Validate inputs
    if (!formData.email || !formData.password) {
      throw new Error("Email and password are required");
    }

    if (type === "signup" && !formData.username) {
      throw new Error("Username is required");
    }

    const response = await axios.post(
      type === "signup" ? SIGNUP_ENDPOINT : LOGIN_ENDPOINT,
      {
        username: formData.username,
        email: formData.email,
        password: formData.password
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    // Handle successful response
    if (!response.data.token) {
      throw new Error("Authentication token not received");
    }

    // Store token and update auth state
    if (login(response.data.token)) {
      navigate("/inventory");
    }

  } catch (error) {
    console.error("Authentication error:", error);
    setError(
      error.response?.data?.error ||
      error.message ||
      "Authentication failed. Please check your credentials and try again."
    );
  } finally {
    setLoading(false);
  }
};

  return (
    <Container className="auth-container py-5">
      <Row className="justify-content-center">
        <Col xs={12} sm={10} md={8} lg={6}>
          <Card className="auth-card shadow border-0">
            <Card.Header className="bg-primary text-white text-center py-4">
              <h2 className="m-0">
                {type === "signup" ? (
                  <><FaUserPlus className="me-2" /> Create Account</>
                ) : (
                  <><FaSignInAlt className="me-2" /> Welcome Back</>
                )}
              </h2>
            </Card.Header>
            <Card.Body className="p-4">
              {error && (
                <Alert variant="danger" className="text-center">
                  {error}
                </Alert>
              )}
              
              <Form onSubmit={handleSubmit}>
                {type === "signup" && (
                  <Form.Group className="mb-4">
                    <Form.Label>
                      <FaUser className="me-2" />Username
                    </Form.Label>
                    <Form.Control
                      type="text"
                      name="username"
                      value={formData.username}
                      onChange={handleChange}
                      placeholder="Choose a username"
                      className="form-control-lg"
                      required
                      minLength="3"
                      maxLength="30"
                    />
                  </Form.Group>
                )}
                
                <Form.Group className="mb-4">
                  <Form.Label>
                    <FaEnvelope className="me-2" />Email Address
                  </Form.Label>
                  <Form.Control
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Enter your email"
                    className="form-control-lg"
                    required
                  />
                </Form.Group>
                
                <Form.Group className="mb-4">
                  <Form.Label>
                    <FaLock className="me-2" />Password
                  </Form.Label>
                  <Form.Control
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder={type === "signup" ? "Create a password (min 8 characters)" : "Enter your password"}
                    className="form-control-lg"
                    required
                    minLength="8"
                  />
                  {type === "signup" && (
                    <Form.Text className="text-muted">
                      Use at least 8 characters with a mix of letters, numbers, and symbols.
                    </Form.Text>
                  )}
                </Form.Group>
                
                <Button 
                  variant="primary" 
                  type="submit" 
                  className="w-100 py-3 mt-3 btn-lg text-uppercase fw-bold"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-2" />
                      Processing...
                    </>
                  ) : type === "signup" ? (
                    <>Sign Up <FaUserPlus className="ms-2" /></>
                  ) : (
                    <>Login <FaSignInAlt className="ms-2" /></>
                  )}
                </Button>
                
                <div className="text-center mt-4">
                  <p className="mb-0">
                    {type === "signup" ? (
                      <>Already have an account?{" "}
                      <a href="/login" className="text-primary fw-bold">
                        Login
                      </a></>
                    ) : (
                      <>Don't have an account?{" "}
                      <a href="/signup" className="text-primary fw-bold">
                        Sign Up
                      </a></>
                    )}
                  </p>
                </div>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default Auth;