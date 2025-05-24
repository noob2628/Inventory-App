import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Table, Button, Modal, Form, Spinner, Alert, InputGroup} from "react-bootstrap";
import { format, parseISO } from "date-fns";
import Sidebar from "./Sidebar";
import { useAuth } from '../context/AuthContext';
import ErrorBoundary from './ErrorBoundary';
import "../styles/Layout.css";
import { toast } from "react-toastify";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
const INVENTORY_ENDPOINT = `${API_BASE_URL}/inventory`;

const formatDate = (dateString) => {
  if (!dateString) return "N/A";
  try {
    return format(parseISO(dateString), "MM/dd/yyyy");
  } catch {
    return "Invalid Date";
  }
};

const displayValue = (value) => {
  if (value === null || value === undefined || value === '') {
    return 'N/A';
  }
  return value;
};

const InventoryTable = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
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
    delivery_date: format(new Date(), "yyyy-MM-dd"),
    delivery_no: "",
    supplier_name: "",
    delivery_details: "",
    stockman: "",
    item_description: "",
    item_code: "",
    color: "",
    qty: "",
    storage: "",
    counted_by: "",
    date_counted: format(new Date(), "yyyy-MM-dd"),
    edited_by: user?.name || "Unknown"
  });

    const currentItems = useMemo(() => {
      return state.filteredInventory;
    }, [state.filteredInventory]);

  // Sort inventory data
  const sortInventory = useCallback((data, { key, direction }) => {
    if (!data || !Array.isArray(data)) return [];
    
    return [...data].sort((a, b) => {
      // Enhanced null handling
      const aValue = a[key] !== undefined && a[key] !== null && a[key] !== "" ? a[key] : '';
      const bValue = b[key] !== undefined && b[key] !== null && b[key] !== "" ? b[key] : '';
      
      if (aValue < bValue) return direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, []);

  const fetchInventory = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setState(prev => ({ ...prev, error: "Authentication required" }));
      navigate("/login");
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Remove search parameter since we'll do client-side filtering
      const response = await axios.get(INVENTORY_ENDPOINT, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      // Log the complete API response for debugging
      console.log("API Response:", response.data);
      
      // Handle different response formats
      let inventoryData = [];
      if (Array.isArray(response.data)) {
        inventoryData = response.data;
      } else if (response.data?.data && Array.isArray(response.data.data)) {
        inventoryData = response.data.data;
      } else if (typeof response.data === 'object') {
        inventoryData = [response.data];
      }
      
      const sortedData = sortInventory(inventoryData, state.sortConfig);

      setState(prev => ({
        ...prev,
        inventory: sortedData,
        filteredInventory: sortedData,
        loading: false
      }));
    } catch (error) {
      console.error("Error fetching inventory:", error);
      let errorMessage = "Failed to fetch inventory";
      
      if (error.response?.status === 401) {
        toast.error("Session expired. Please login again.");
        navigate("/login");
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      }
      
      setState(prev => ({
        ...prev,
        error: errorMessage,
        loading: false
      }));
      
      toast.error(errorMessage);
    }
  }, [navigate, state.sortConfig, sortInventory]);

  useEffect(() => {
    if (!user) navigate("/login");
    else fetchInventory();
  }, [user, navigate, fetchInventory]);

  // Search functionality - implemented like in Refill.js
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

    setState(prev => ({ ...prev, filteredInventory: filtered }));
  }, [state.searchQuery, state.inventory]);

  // Sorting function
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

  const handleSubmit = async () => {
    const token = localStorage.getItem("token");
    if (!token) return toast.error("Authentication required");

    if (!formData.item_description || !formData.delivery_no) {
      return toast.error("Item description and delivery number are required");
    }

    try {
      setState(prev => ({ ...prev, loading: true }));
      
      const config = {
        headers: { Authorization: `Bearer ${token}` }
      };

      const dataToSend = {
        // Required fields
        delivery_date: formData.delivery_date,
        item_description: formData.item_description,
        qty: formData.qty,
        
        // Optional fields
        delivery_no: formData.delivery_no,
        supplier_name: formData.supplier_name,
        delivery_details: formData.delivery_details,
        stockman: formData.stockman,
        item_code: formData.item_code,
        color: formData.color,
        storage: formData.storage,
        counted_by: formData.counted_by,
        date_counted: formData.date_counted,
      
        // System fields
        recorded_by: user?.id,
        edited_by: user?.id
      };

      if (state.editingItem) {
        await axios.put(
          `${INVENTORY_ENDPOINT}/${state.editingItem.id}`,
          dataToSend,
          config
        );
        toast.success("Item updated successfully");
      } else {
        await axios.post(
          INVENTORY_ENDPOINT,
          dataToSend,
          config
        );
        toast.success("Item added successfully");
      }

      await fetchInventory();
      setState(prev => ({
        ...prev,
        showModal: false,
        editingItem: null,
        loading: false
      }));
      setFormData({
        delivery_date: format(new Date(), "yyyy-MM-dd"),
        delivery_no: "",
        supplier_name: "",
        delivery_details: "",
        stockman: "",
        item_description: "",
        item_code: "",
        color: "",
        qty: "",
        storage: "",
        counted_by: "",
        date_counted: format(new Date(), "yyyy-MM-dd"),
      });
    } catch (error) {
      setState(prev => ({ ...prev, loading: false }));
      toast.error(error.response?.data?.error || "Operation failed");
    }
  };

  const handleEdit = (item) => {
    setState(prev => ({ ...prev, editingItem: item, showModal: true }));
    setFormData({
      delivery_date: item.delivery_date ? format(parseISO(item.delivery_date), "yyyy-MM-dd") : "",
      delivery_no: item.delivery_no || "",
      supplier_name: item.supplier_name || "",
      delivery_details: item.delivery_details || "",
      stockman: item.stockman || "",
      item_description: item.item_description || "",
      item_code: item.item_code || "",
      color: item.color || "",
      qty: item.qty || "",
      storage: item.storage || "",
      date_counted: item.date_counted ? format(parseISO(item.date_counted), "yyyy-MM-dd") : "",
      counted_by: item.counted_by || "",
      edited_by: user?.name || "Unknown"
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this item?")) return;

    try {
      setState(prev => ({ ...prev, loading: true }));
      await axios.delete(`${INVENTORY_ENDPOINT}/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      toast.success("Item deleted successfully");
      await fetchInventory();
    } catch (error) {
      toast.error(error.response?.data?.error || "Delete operation failed");
    } finally {
      setState(prev => ({ ...prev, loading: false }));
    }
  };

  if (!user) return null;

  return (
    <div className="layout">
      <ErrorBoundary>
        <Sidebar />
      </ErrorBoundary>
      <div className="content">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h2 className="inventory-header">Inventory Management</h2>
          <div>
            <Button
              variant="secondary"
              onClick={fetchInventory}
              disabled={state.loading}
              className="me-2"
            >
              {state.loading ? <Spinner animation="border" size="sm" /> : "Refresh Data"}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setState(prev => ({ ...prev, showModal: true, editingItem: null }));
                setFormData({
                  delivery_date: format(new Date(), "yyyy-MM-dd"),
                  delivery_no: "",
                  supplier_name: "",
                  delivery_details: "",
                  stockman: "",
                  item_description: "",
                  item_code: "",
                  color: "",
                  qty: "",
                  storage: "",
                  counted_by: "",
                  date_counted: format(new Date(), "yyyy-MM-dd"),
                  edited_by: user?.name || "Unknown"
                });
              }}
              disabled={state.loading}
            >
              {state.loading ? <Spinner animation="border" size="sm" /> : "Add New Item"}
            </Button>
          </div>
        </div>

        {state.error && <Alert variant="danger" className="mb-3">{state.error}</Alert>}

        <div className="mb-3">
          <InputGroup style={{ width: '300px' }}>
            <Form.Control
              type="text"
              placeholder="Search inventory..."
              value={state.searchQuery}
              onChange={(e) => setState(prev => ({ ...prev, searchQuery: e.target.value }))}
              disabled={state.loading}
            />
            <InputGroup.Text>
              {state.loading ? <Spinner animation="border" size="sm" /> : "🔍"}
            </InputGroup.Text>
          </InputGroup>
        </div>
        
        <div className="table-responsive-container">
          <div className="table-container">
            <Table striped bordered hover className="mt-3">
              <thead className="table-dark sticky-header">
                <tr>
                  <th>
                    <Button 
                      variant="link" 
                      onClick={() => requestSort('delivery_date')}
                      className="text-white p-0 text-decoration-none"
                    >
                      Date Delivered {state.sortConfig.key === 'delivery_date' ? (state.sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </Button>
                  </th>
                  <th>
                    <Button 
                      variant="link" 
                      onClick={() => requestSort('delivery_no')}
                      className="text-white p-0 text-decoration-none"
                    >
                      Delivery No {state.sortConfig.key === 'delivery_no' ? (state.sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </Button>
                  </th>
                  <th>
                    <Button 
                      variant="link" 
                      onClick={() => requestSort('supplier_name')}
                      className="text-white p-0 text-decoration-none"
                    >
                      Supplier {state.sortConfig.key === 'supplier_name' ? (state.sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </Button>
                  </th>
                  <th>
                    <Button 
                      variant="link" 
                      onClick={() => requestSort('delivery_details')}
                      className="text-white p-0 text-decoration-none"
                    >
                      Delivery Details {state.sortConfig.key === 'delivery_details' ? (state.sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </Button>
                  </th>
                  <th>
                    <Button 
                      variant="link" 
                      onClick={() => requestSort('stockman')}
                      className="text-white p-0 text-decoration-none"
                    >
                      Stockman {state.sortConfig.key === 'stockman' ? (state.sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </Button>
                  </th>
                  <th>
                    <Button 
                      variant="link" 
                      onClick={() => requestSort('item_description')}
                      className="text-white p-0 text-decoration-none"
                    >
                      Item Description {state.sortConfig.key === 'item_description' ? (state.sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </Button>
                  </th>
                  <th>
                    <Button 
                      variant="link" 
                      onClick={() => requestSort('item_code')}
                      className="text-white p-0 text-decoration-none"
                    >
                      Item Code {state.sortConfig.key === 'item_code' ? (state.sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </Button>
                  </th>
                  <th>
                    <Button 
                      variant="link" 
                      onClick={() => requestSort('color')}
                      className="text-white p-0 text-decoration-none"
                    >
                      Color {state.sortConfig.key === 'color' ? (state.sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </Button>
                  </th>
                  <th>
                    <Button 
                      variant="link" 
                      onClick={() => requestSort('qty')}
                      className="text-white p-0 text-decoration-none"
                    >
                      Quantity {state.sortConfig.key === 'qty' ? (state.sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </Button>
                  </th>
                  <th>
                    <Button 
                      variant="link" 
                      onClick={() => requestSort('storage')}
                      className="text-white p-0 text-decoration-none"
                    >
                      Storage {state.sortConfig.key === 'storage' ? (state.sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </Button>
                  </th>
                  <th>
                    <Button 
                      variant="link" 
                      onClick={() => requestSort('date_counted')}
                      className="text-white p-0 text-decoration-none"
                    >
                      Date Counted {state.sortConfig.key === 'date_counted' ? (state.sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </Button>
                  </th>
                  <th>
                    <Button 
                      variant="link" 
                      onClick={() => requestSort('counted_by')}
                      className="text-white p-0 text-decoration-none"
                    >
                      Counted By {state.sortConfig.key === 'counted_by' ? (state.sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </Button>
                  </th>
                  <th className="sticky-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.loading && !state.inventory.length ? (
                  <tr>
                    <td colSpan="14" className="text-center">
                      <Spinner animation="border" />
                    </td>
                  </tr>
                ) : currentItems.length === 0 ? (
                  <tr>
                    <td colSpan="14" className="text-center">
                      {state.searchQuery ? "No matching items found" : "No inventory items available"}
                    </td>
                  </tr>
                ) : (
                  currentItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.delivery_date ? formatDate(item.delivery_date) : "N/A"}</td>
                      <td>{displayValue(item.delivery_no)}</td>
                      <td>{displayValue(item.supplier_name)}</td>
                      <td>{displayValue(item.delivery_details)}</td>
                      <td>{displayValue(item.stockman)}</td>
                      <td>{displayValue(item.item_description)}</td>
                      <td>{displayValue(item.item_code)}</td>
                      <td>{displayValue(item.color)}</td>
                      <td>{displayValue(item.qty)}</td>
                      <td>{displayValue(item.storage)}</td>
                      <td>{item.date_counted ? formatDate(item.date_counted) : "N/A"}</td>
                      <td>{displayValue(item.counted_by)}</td>
                      <td className="sticky-actions">
                        <div className="d-flex gap-2">
                          <Button
                            variant="outline-primary"
                            size="sm"
                            onClick={() => handleEdit(item)}
                            disabled={state.loading}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => handleDelete(item.id)}
                            disabled={state.loading}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </div>
        </div>
      
        <Modal show={state.showModal} onHide={() => setState(prev => ({ ...prev, showModal: false }))}>
          <Modal.Header closeButton>
            <Modal.Title>{state.editingItem ? "Edit Inventory Item" : "Add New Inventory Item"}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form>
              <Form.Group className="mb-3">
                <Form.Label>Item Description *</Form.Label>
                <Form.Control
                  type="text"
                  name="item_description"
                  value={formData.item_description}
                  onChange={handleChange}
                  required
                />
              </Form.Group>

              <div className="row">
                <div className="col-md-6">
                  <Form.Group className="mb-3">
                    <Form.Label>Date Delivered</Form.Label>
                    <Form.Control
                      type="date"
                      name="delivery_date"
                      value={formData.delivery_date}
                      onChange={handleChange}
                    />
                  </Form.Group>
                </div>
                <div className="col-md-6">
                  <Form.Group className="mb-3">
                    <Form.Label>Delivery Number *</Form.Label>
                    <Form.Control
                      type="text"
                      name="delivery_no"
                      value={formData.delivery_no}
                      onChange={handleChange}
                      required
                    />
                  </Form.Group>
                </div>
              </div>

              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Supplier Name</Form.Label>
                  <Form.Control
                    type="text"
                    name="supplier_name"
                    value={formData.supplier_name}
                    onChange={handleChange}
                  />
                </Form.Group>
              </div>

              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Delivery Details</Form.Label>
                  <Form.Control
                    type="text"
                    name="delivery_details"
                    value={formData.delivery_details}
                    onChange={handleChange}
                  />
                </Form.Group>
              </div>

              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Stockman</Form.Label>
                  <Form.Control
                    type="text"
                    name="stockman"
                    value={formData.stockman}
                    onChange={handleChange}
                  />
                </Form.Group>
              </div>

              <Form.Group className="mb-3">
                <Form.Label>Item Code</Form.Label>
                <Form.Control
                  type="text"
                  name="item_code"
                  value={formData.item_code}
                  onChange={handleChange}
                />
              </Form.Group>

              <div className="row">
                <div className="col-md-6">
                  <Form.Group className="mb-3">
                    <Form.Label>Color</Form.Label>
                    <Form.Control
                      type="text"
                      name="color"
                      value={formData.color}
                      onChange={handleChange}
                    />
                  </Form.Group>
                </div>

                <div className="col-md-6">
                  <Form.Group className="mb-3">
                    <Form.Label>Quantity</Form.Label>
                    <Form.Control
                      type="number"
                      name="qty"
                      value={formData.qty}
                      onChange={handleChange}
                    />
                  </Form.Group>
                  </div>

                <div className="col-md-6">
                  <Form.Group className="mb-3">
                    <Form.Label>Storage Location</Form.Label>
                    <Form.Control
                      type="text"
                      name="storage"
                      value={formData.storage}
                      onChange={handleChange}
                    />
                  </Form.Group>
                </div>
              </div>

              <Form.Group className="mb-3">
                <Form.Label>Date Counted</Form.Label>
                <Form.Control
                  type="date"
                  name="date_counted"
                  value={formData.date_counted}
                  onChange={handleChange}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Counted By</Form.Label>
                <Form.Control
                  type="text"
                  name="counted_by"
                  value={formData.counted_by}
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
              ) : state.editingItem ? (
                "Update Item"
              ) : (
                "Add Item"
              )}
            </Button>
          </Modal.Footer>
        </Modal>
      </div>
    </div>
  );
};

export default InventoryTable;