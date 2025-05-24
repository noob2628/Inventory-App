import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Table, Button, Modal, Form, Spinner, Alert, InputGroup} from "react-bootstrap";
import { format, parseISO } from "date-fns";
import Sidebar from "./Sidebar";
import ErrorBoundary from './ErrorBoundary';
import { useAuth } from "../context/AuthContext";
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

// Update the date formatting functions
const formatDateForDisplay = (dateString) => {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    return isNaN(date) ? "-" : format(date, "MM/dd/yyyy");
  } catch {
    return "-";
  }
};

const formatDateForBackend = (dateString) => {
  try {
    const date = new Date(dateString);
    return isNaN(date) ? null : format(date, "yyyy-MM-dd");
  } catch {
    return null;
  }
};

const Counting = () => {
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
    sortConfig: { key: 'delivery_date', direction: 'desc' }
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
    edited_by: user?.name || "Unknown",
  });


   const currentItems = useMemo(() => {
    return state.filteredInventory;
  }, [state.filteredInventory]);

  // Sorting functionality
  const sortInventory = useCallback((data, { key, direction }) => {
    if (!data || !Array.isArray(data)) return [];
    return [...data].sort((a, b) => {
      const aValue = a[key] || '';
      const bValue = b[key] || '';
      if (aValue < bValue) return direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, []);

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

  // Form handling
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
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
      edited_by: user?.name || "Unknown",
    });
  };

  // Data operations
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
      
      let inventoryData = [];
      if (response.data) {
        if (Array.isArray(response.data)) {
          inventoryData = response.data;
        } else if (response.data.data && Array.isArray(response.data.data)) {
          inventoryData = response.data.data;
        } else if (typeof response.data === 'object') {
          inventoryData = [response.data];
        }
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
      if (error.response) {
        errorMessage = error.response.data?.error || 
                     `Server error (${error.response.status})`;
      }
      setState(prev => ({ ...prev, error: errorMessage, loading: false }));
      toast.error(errorMessage);
    }
  }, [navigate, state.sortConfig, sortInventory]);

  const handleSubmit = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("Authentication required");
      return;
    }
  
    // Validate required fields
    const requiredFields = ['item_description', 'qty'];
    const missingFields = requiredFields.filter(field => !formData[field]);
    if (missingFields.length > 0) {
      toast.error(`Missing required fields: ${missingFields.join(', ')}`);
      return;
    }
  
    try {
      setState(prev => ({ ...prev, loading: true }));
      
      const config = {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };
  
      // Prepare data for backend with proper null handling
      const payload = {
        ...formData,
        qty: Number(formData.qty),
        delivery_date: formatDateForBackend(formData.delivery_date),
        date_counted: formatDateForBackend(formData.date_counted),
        delivery_no: formData.delivery_no || null,
        supplier_name: formData.supplier_name || null,
        delivery_details: formData.delivery_details || null,
        stockman: formData.stockman || null,
        item_code: formData.item_code || null,
        color: formData.color || null,
        storage: formData.storage || null,
        counted_by: formData.counted_by || null,
        edited_by: user?.name || "Unknown"
      };
  
      // Remove ID for PUT requests
      if (state.editingItem) {
        delete payload.id;
        await axios.put(
          `${INVENTORY_ENDPOINT}/${state.editingItem.id}`,
          payload,
          config
        );
        toast.success("Item updated successfully");
      } else {
        await axios.post(INVENTORY_ENDPOINT, payload, config);
        toast.success("Item added successfully");
      }
  
      await fetchInventory();
      setState(prev => ({
        ...prev,
        showModal: false,
        editingItem: null,
        loading: false
      }));
      resetForm();
    } catch (error) {
      console.error("Update error:", {
        status: error.response?.status,
        data: error.response?.data,
        config: error.config
      });
      
      let errorMessage = "Operation failed";
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
      setState(prev => ({ ...prev, loading: false }));
    }
  };

  // Update the handleEdit function
  const handleEdit = (item) => {
    setState(prev => ({ ...prev, editingItem: item, showModal: true }));
    setFormData({
      delivery_date: item.delivery_date ? format(new Date(item.delivery_date), "yyyy-MM-dd") : "",
      date_counted: item.date_counted ? format(new Date(item.date_counted), "yyyy-MM-dd") : "",
      // Keep the rest of the fields the same
      delivery_no: item.delivery_no || "",
      supplier_name: item.supplier_name || "",
      delivery_details: item.delivery_details || "",
      stockman: item.stockman || "",
      item_description: item.item_description || "",
      item_code: item.item_code || "",
      color: item.color || "",
      qty: item.qty || "",
      storage: item.storage || "",
      counted_by: item.counted_by || "",
      edited_by: user?.name || "Unknown"
    });
  };

  const duplicateItem = async (item) => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("Authentication required");
      return;
    }
  
    try {
      setState(prev => ({ ...prev, loading: true }));
      const { id, ...itemCopy } = item;
      await axios.post(
        INVENTORY_ENDPOINT,
        {
          ...itemCopy,
          edited_by: user?.name || "Unknown",
          date_counted: format(new Date(), "yyyy-MM-dd")
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Item duplicated successfully");
      await fetchInventory();
    } catch (error) {
      const errorMessage = error.response?.data?.error || "Failed to duplicate item";
      toast.error(errorMessage);
    } finally {
      setState(prev => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    if (!user) navigate("/login");
    else fetchInventory();
  }, [user, navigate, fetchInventory]);

  useEffect(() => {
    if (state.searchQuery.trim() === "") {
      setState(prev => ({ ...prev, filteredInventory: prev.inventory }));
      return;
    }
    const filtered = state.inventory.filter(item =>
      Object.entries(item).some(([key, value]) => {
        if (key === "id") return false;
        return value?.toString().toLowerCase().includes(state.searchQuery.toLowerCase());
      })
    );
    setState(prev => ({ ...prev, filteredInventory: filtered, currentPage: 1 }));
  }, [state.searchQuery, state.inventory]);

  if (!user) return null;

  return (
    <div className="layout">
      <ErrorBoundary>
        <Sidebar />
      </ErrorBoundary>
      <div className="content">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h2 className="inventory-header">Counting Details</h2>
          <Button
            variant="primary"
            onClick={() => {
              setState(prev => ({
                ...prev,
                editingItem: null,
                showModal: true
              }));
              setFormData({
                delivery_date: formatDate(new Date(), "yyyy-MM-dd"),
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
                date_counted: formatDate(new Date(), "yyyy-MM-dd"),
                edited_by: user?.name || "Unknown",
              });
            }}
            disabled={state.loading}
          >
            {state.loading ? <Spinner animation="border" size="sm" /> : "Add New Item"}
          </Button>
        </div>

        {state.error && (
          <Alert variant="danger" className="mb-3">
            {state.error}
          </Alert>
        )}

        <div className="d-flex justify-content-between mb-3">
          <InputGroup style={{ width: '300px' }}>
            <Form.Control
              type="text"
              placeholder="Search counting details..."
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
                      onClick={() => requestSort('id')}
                      className="text-white p-0 text-decoration-none"
                    >
                      ID {state.sortConfig.key === 'id' ? (state.sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </Button>
                  </th>
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
                  <th>
                    <Button 
                      variant="link" 
                      onClick={() => requestSort('edited_by')}
                      className="text-white p-0 text-decoration-none"
                    >
                     Edited By {state.sortConfig.key === 'edited_by' ? (state.sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </Button>
                  </th>
                  <th className="sticky-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.loading && !state.inventory.length ? (
                  <tr>
                    <td colSpan="15" className="text-center">
                      <Spinner animation="border" />
                    </td>
                  </tr>
                ) : currentItems.length === 0 ? (
                  <tr>
                    <td colSpan="15" className="text-center">
                      {state.searchQuery ? "No matching items found" : "No counting details available"}
                    </td>
                  </tr>
                ) : (
                  currentItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{formatDateForDisplay(item.delivery_date)}</td>
                      <td>{item.delivery_no || ""}</td>
                      <td>{item.supplier_name || ""}</td>
                      <td>{item.delivery_details || ""}</td>
                      <td>{item.stockman || ""}</td>
                      <td>{item.item_description || ""}</td>
                      <td>{item.item_code || ""}</td>
                      <td>{item.color || ""}</td>
                      <td>{item.qty || ""}</td>
                      <td>{item.storage || ""}</td>
                      <td>{formatDateForDisplay(item.date_counted)}</td>
                      <td>{item.counted_by || ""}</td>
                      <td>{item.edited_by || "N/A"}</td>
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
                            variant="outline-success"
                            size="sm"
                            onClick={() => duplicateItem(item)}
                            disabled={state.loading}
                          >
                            Duplicate
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
            <Modal.Title>
              {state.editingItem ? "Edit Counting Details" : "Add New Counting Details"}
            </Modal.Title>
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

              <Form.Group className="mb-3">
                <Form.Label>Quantity *</Form.Label>
                <Form.Control
                  type="number"
                  name="qty"
                  value={formData.qty}
                  onChange={handleChange}
                  required
                  min="1"
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
                    <Form.Label>Delivery Number</Form.Label>
                    <Form.Control
                      type="text"
                      name="delivery_no"
                      value={formData.delivery_no}
                      onChange={handleChange}
                    />
                  </Form.Group>
                </div>
              </div>

              <Form.Group className="mb-3">
                <Form.Label>Supplier Name</Form.Label>
                <Form.Control
                  type="text"
                  name="supplier_name"
                  value={formData.supplier_name}
                  onChange={handleChange}
                />
              </Form.Group>

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
                <Form.Label>Counted By</Form.Label>
                <Form.Control
                  type="text"
                  name="counted_by"
                  value={formData.counted_by}
                  onChange={handleChange}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Date Counted</Form.Label>
                <Form.Control
                  type="date"
                  name="date_counted"
                  value={formData.date_counted}
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
                "Update"
              ) : (
                "Add"
              )}
            </Button>
          </Modal.Footer>
        </Modal>
        </div>
    </div>
  );
};

export default Counting;