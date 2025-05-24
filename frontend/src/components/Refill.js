import React, { useState, useEffect, useContext, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Table, Button, Modal, Form, Spinner, Alert, InputGroup} from "react-bootstrap";
import { format, parseISO, isValid } from "date-fns";
import Sidebar from "./Sidebar";
import { AuthContext } from "../context/AuthContext";
import ErrorBoundary from './ErrorBoundary';
import "../styles/Layout.css";
import { toast } from "react-toastify";

// Constants
const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
const INVENTORY_ENDPOINT = `${API_BASE_URL}/inventory`;

// Helper function to safely format dates
const formatDateSafely = (dateString) => {
  if (!dateString) return "-";
  try {
    const date = parseISO(dateString);
    return isValid(date) ? format(date, "MM/dd/yyyy") : "-";
  } catch (error) {
    console.error("Date formatting error:", error);
    return "-";
  }
};

// Helper function to safely display values
const safeValue = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  return value;
};

const Refill = () => {
  const { role } = useContext(AuthContext); // Get role from context
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  
  // State management
  const [state, setState] = useState({
    inventory: [],
    filteredInventory: [],
    loading: false,
    error: null,
    searchQuery: "",
    showModal: false,
    editingItem: null,
    sortConfig: {
      key: 'delivery_date',
      direction: 'desc'
    }
  });

  const [formData, setFormData] = useState({
    refill_status: "",
    date_of_refill: format(new Date(), "yyyy-MM-dd"),
    refill_by: user?.name || "",
  });

  const currentItems = useMemo(() => {
    return state.filteredInventory;
  }, [state.filteredInventory]);

  // Sort inventory data with improved null checks
  const sortInventory = useCallback((data, { key, direction }) => {
    if (!data || !Array.isArray(data)) return [];
    
    return [...data].sort((a, b) => {
      // Enhanced null handling - treat empty strings as null too
      const aValue = a[key] !== undefined && a[key] !== null && a[key] !== "" ? a[key] : '';
      const bValue = b[key] !== undefined && b[key] !== null && b[key] !== "" ? b[key] : '';
      
      if (aValue < bValue) return direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, []);

  // Improved fetch function with better error handling
  const fetchInventory = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setState(prev => ({ ...prev, error: "Authentication required" }));
      navigate("/login");
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const response = await axios.get(INVENTORY_ENDPOINT, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      // Handle different response formats and ensure data processing
      let inventoryData = [];
      if (Array.isArray(response.data)) {
        inventoryData = response.data;
      } else if (response.data?.data && Array.isArray(response.data.data)) {
        inventoryData = response.data.data;
      } else if (typeof response.data === 'object') {
        inventoryData = [response.data];
      }

      // Log data for debugging
      console.log("Raw inventory data:", inventoryData);
      
      // Ensure all date fields have consistent format
      const processedData = inventoryData.map(item => ({
        ...item,
        // Process date fields to ensure they're valid
        delivery_date: item.delivery_date || null,
        date_counted: item.date_counted || null,
        date_of_refill: item.date_of_refill || null
      }));

      const sortedData = sortInventory(processedData, state.sortConfig);

      setState(prev => ({
        ...prev,
        inventory: sortedData,
        filteredInventory: sortedData,
        loading: false
      }));
    } catch (error) {
      const errorMessage = error.response?.data?.error || 
                         error.response?.data?.message || 
                         error.message || 
                         "Failed to fetch inventory";
      
      setState(prev => ({
        ...prev,
        error: errorMessage,
        loading: false
      }));
      toast.error(errorMessage);
    }
  }, [navigate, state.sortConfig, sortInventory]);

  // Initial load
  useEffect(() => {
    if (!user) {
      navigate("/login");
    } else {
      fetchInventory();
    }
  }, [user, navigate, fetchInventory]);

  // Search functionality
  useEffect(() => {
    if (state.searchQuery.trim() === "") {
      setState(prev => ({ ...prev, filteredInventory: prev.inventory }));
      return;
    }

    const filtered = state.inventory.filter(item =>
      Object.entries(item).some(([key, value]) => {
        if (key === "id") return false;
        return String(value || '').toLowerCase().includes(state.searchQuery.toLowerCase());
      })
    );

    setState(prev => ({ ...prev, filteredInventory: filtered, currentPage: 1 }));
  }, [state.searchQuery, state.inventory]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (state.sortConfig.key === key && state.sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    const sortConfig = { key, direction };
    const sortedData = sortInventory(state.filteredInventory, sortConfig);
    
    setState(prev => ({
      ...prev,
      sortConfig,
      filteredInventory: sortedData
    }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Improved submit handler
  const handleSubmit = async () => {
    if (role !== 'admin') {
      toast.error("Only admins can update refill details");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("Authentication required");
      return;
    }

    if (!formData.refill_status) {
      toast.error("Refill status is required!");
      return;
    }

    try {
      setState(prev => ({ ...prev, loading: true }));
      
      const config = {
        headers: { Authorization: `Bearer ${token}` }
      };

      const dataToSend = {
        ...state.editingItem,
        ...formData,
        refill_by: formData.refill_by || user?.name || "Unknown"
      };

      // Log what's being sent for debugging
      console.log("Updating item with data:", dataToSend);

      await axios.put(
        `${INVENTORY_ENDPOINT}/${state.editingItem.id}`,
        dataToSend,
        config
      );
      
      toast.success("Refill details updated successfully");
      await fetchInventory();
      setState(prev => ({
        ...prev,
        showModal: false,
        editingItem: null,
        loading: false
      }));
    } catch (error) {
      const errorMessage = error.response?.data?.error || 
                         error.response?.data?.message || 
                         error.message || 
                         "Operation failed";
      toast.error(errorMessage);
      setState(prev => ({ ...prev, loading: false }));
    }
  };

  const handleEdit = (item) => {
    console.log("Editing item:", item);
    setState(prev => ({ ...prev, editingItem: item, showModal: true }));
    setFormData({
      refill_status: item.refill_status || "",
      date_of_refill: item.date_of_refill ? 
        formatDateSafely(item.date_of_refill).includes("-") ? 
          format(new Date(), "yyyy-MM-dd") : 
          format(parseISO(item.date_of_refill), "yyyy-MM-dd")
        : format(new Date(), "yyyy-MM-dd"),
      refill_by: item.refill_by || user?.name || ""
    });
  };

  if (!user) return null;

  return (
    <div className="layout">
      <ErrorBoundary>
        <Sidebar />
      </ErrorBoundary>
      <div className="content">
        {/* Header and controls */}
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h2 className="inventory-header">Refill Management</h2>
          <Button
            variant="primary"
            onClick={fetchInventory}
            disabled={state.loading}
          >
            {state.loading ? <Spinner animation="border" size="sm" /> : "Refresh Data"}
          </Button>
        </div>

        {state.error && (
          <Alert variant="danger" className="mb-3">
            {state.error}
          </Alert>
        )}

        {/* Search and pagination controls */}
        <div className="d-flex justify-content-between mb-3">
          <InputGroup style={{ width: '300px' }}>
            <Form.Control
              type="text"
              placeholder="Search refill details..."
              value={state.searchQuery}
              onChange={(e) => setState(prev => ({ ...prev, searchQuery: e.target.value }))}
              disabled={state.loading}
            />
            <InputGroup.Text>
              {state.loading ? <Spinner animation="border" size="sm" /> : "🔍"}
            </InputGroup.Text>
          </InputGroup>
        </div>

        {/* Table with improved field display and null checks */}
        <div className="table-responsive-container">
          <div className="table-container">
            <Table striped bordered hover className="mt-3">
              <thead className="table-dark sticky-header">
                <tr>
                  {[
                    'delivery_no', 
                    'supplier_name', 
                    'delivery_date', 
                    'delivery_details',
                    'stockman', 
                    'item_description', 
                    'item_code', 
                    'color', 
                    'qty',
                    'storage', 
                    'date_counted', 
                    'counted_by', 
                    'refill_status',
                    'date_of_refill', 
                    'refill_by'
                  ].map((key) => (
                    <th key={key}>
                      <Button 
                        variant="link" 
                        onClick={() => requestSort(key)}
                        className="text-white p-0 text-decoration-none"
                      >
                        {key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} 
                        {state.sortConfig.key === key ? (state.sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                      </Button>
                    </th>
                  ))}
                  <th className="sticky-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.loading && !state.inventory.length ? (
                  <tr>
                    <td colSpan="16" className="text-center">
                      <Spinner animation="border" />
                    </td>
                  </tr>
                ) : currentItems.length === 0 ? (
                  <tr>
                    <td colSpan="16" className="text-center">
                      {state.searchQuery ? "No matching items found" : "No refill details available"}
                    </td>
                  </tr>
                ) : (
                  currentItems.map((item) => {
                    console.log("Current item:", currentItems);
                    return(
                      <tr key={item.id}>
                        <td>{safeValue(item.delivery_no)}</td>
                        <td>{safeValue(item.supplier_name)}</td>
                        <td>{item.delivery_date ? formatDateSafely(item.delivery_date) : "-"}</td>
                        <td>{safeValue(item.delivery_details)}</td>
                        <td>{safeValue(item.stockman)}</td>
                        <td>{safeValue(item.item_description)}</td>
                        <td>{safeValue(item.item_code)}</td>
                        <td>{safeValue(item.color)}</td>
                        <td>{safeValue(item.qty)}</td>
                        <td>{safeValue(item.storage)}</td>
                        <td>{item.date_counted ? formatDateSafely(item.date_counted) : "-"}</td>
                        <td>{safeValue(item.counted_by)}</td>
                        <td>{safeValue(item.refill_status)}</td>
                        <td>{item.date_of_refill ? formatDateSafely(item.date_of_refill) : "-"}</td>
                        <td>{safeValue(item.refill_by)}</td>
                        <td className="sticky-actions">
                          <div className="d-flex gap-2">
                            {role === 'admin' && (
                              <Button
                                variant="outline-primary"
                                size="sm"
                                onClick={() => handleEdit(item)}
                                disabled={state.loading}
                              >
                                Edit
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </Table>
          </div>
        </div>

        {/* Modal */}
        <Modal show={state.showModal} onHide={() => setState(prev => ({ ...prev, showModal: false }))}>
          <Modal.Header closeButton>
            <Modal.Title>Edit Refill Details</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form>
              <Form.Group className="mb-3">
                <Form.Label>Refill Status *</Form.Label>
                <Form.Control
                  as="select"
                  name="refill_status"
                  value={formData.refill_status || ""}
                  onChange={handleChange}
                  required
                >
                  <option value=""></option>
                  <option value="X">X</option>
                  <option value="YES">YES</option>
                  <option value="HOLYSHEEP">HOLYSHEEP</option>
                  <option value="RETURN">RETURN</option>
                  <option value="CHOICE">CHOICE</option>
                </Form.Control>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Date of Refill</Form.Label>
                <Form.Control
                  type="date"
                  name="date_of_refill"
                  value={formData.date_of_refill}
                  onChange={handleChange}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Refilled By</Form.Label>
                <Form.Control
                  type="text"
                  name="refill_by"
                  value={formData.refill_by}
                  onChange={handleChange}
                />
              </Form.Group>
            </Form>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => setState(prev => ({ ...prev, showModal: false }))}
              disabled={state.loading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={state.loading}
            >
              {state.loading ? (
                <Spinner animation="border" size="sm" />
              ) : (
                "Update"
              )}
            </Button>
          </Modal.Footer>
        </Modal>
      </div>
    </div>
  );
};

export default Refill;