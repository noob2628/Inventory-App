import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Card, Spinner, Alert, Form } from "react-bootstrap";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { useAuth } from '../context/AuthContext';
import Sidebar from "./Sidebar";
import ErrorBoundary from './ErrorBoundary';
import "../styles/Layout.css";
import axios from "axios";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

const Dashboard = () => {
  const { user } = useAuth();
  const [state, setState] = useState({
    loading: true,
    error: null,
    inventory: [],
    filters: {
      startDate: startOfMonth(new Date()),
      endDate: endOfMonth(new Date()),
      supplier: 'all',
      status: 'all'
    }
  });

  const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#00C49F'];

  // In the fetchData function, modify the API response handling:
const fetchData = useCallback(async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/inventory`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });

    // Handle different response formats
    let inventoryData = [];
    if (Array.isArray(response.data)) {
      inventoryData = response.data;
    } else if (response.data?.data && Array.isArray(response.data.data)) {
      inventoryData = response.data.data;
    } else if (typeof response.data === 'object') {
      inventoryData = [response.data];
    }

    setState(prev => ({
      ...prev,
      inventory: inventoryData,
      loading: false
    }));
  } catch (error) {
    setState(prev => ({
      ...prev,
      error: error.response?.data?.error || "Failed to load data",
      loading: false
    }));
  }
}, []);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  const processData = () => {
    const { inventory, filters } = state;

    // Filter data based on current filters
    // In the processData function, update the filter:
    const filteredData = inventory.filter(item => {
    // Handle missing delivery dates
    if (!item.delivery_date) return false;
    
    try {
        const itemDate = parseISO(item.delivery_date);
        return (
        itemDate >= filters.startDate &&
        itemDate <= filters.endDate &&
        (filters.supplier === 'all' || item.supplier_name === filters.supplier) &&
        (filters.status === 'all' || item.refill_status === filters.status)
        );
    } catch {
        return false; // Skip invalid dates
    }
    });

    // Data processing for charts
    const statusDistribution = filteredData.reduce((acc, item) => {
      acc[item.refill_status] = (acc[item.refill_status] || 0) + 1;
      return acc;
    }, {});

    const monthlyData = filteredData.reduce((acc, item) => {
      const month = format(parseISO(item.delivery_date), 'MMM yyyy');
      if (!acc[month]) {
        acc[month] = { month, quantity: 0, deliveries: 0 };
      }
      acc[month].quantity += item.qty;
      acc[month].deliveries++;
      return acc;
    }, {});

    const supplierData = filteredData.reduce((acc, item) => {
      const supplier = item.supplier_name || 'Unknown';
      if (!acc[supplier]) {
        acc[supplier] = { supplier, total: 0, count: 0 };
      }
      acc[supplier].total += item.qty;
      acc[supplier].count++;
      return acc;
    }, {});

    return {
      statusData: Object.entries(statusDistribution).map(([name, value]) => ({ name, value })),
      monthlyData: Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month)),
      supplierData: Object.values(supplierData)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5),
      totalItems: filteredData.length,
      totalQuantity: filteredData.reduce((sum, item) => sum + item.qty, 0),
      lowStock: filteredData.filter(item => item.qty < 100).length,
      recentActivity: filteredData
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        .slice(0, 5)
    };
  };

  const { statusData, monthlyData, supplierData, totalItems, totalQuantity, lowStock, recentActivity } = processData();

  if (!user) return null;

  return (
    <div className="layout">
      <ErrorBoundary>
        <Sidebar />
      </ErrorBoundary>
      <div className="content p-4">
        <h2 className="mb-4">Inventory Analytics Dashboard</h2>
        
        {state.error && <Alert variant="danger">{state.error}</Alert>}

        {/* Filters */}
        <Card className="mb-4">
          <Card.Body>
            <Row>
              <Col md={3}>
                <Form.Group>
                  <Form.Label>Start Date</Form.Label>
                  <Form.Control
                    type="date"
                    value={format(state.filters.startDate, 'yyyy-MM-dd')}
                    onChange={e => setState(prev => ({
                      ...prev,
                      filters: { ...prev.filters, startDate: parseISO(e.target.value) }
                    }))}
                  />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group>
                  <Form.Label>End Date</Form.Label>
                  <Form.Control
                    type="date"
                    value={format(state.filters.endDate, 'yyyy-MM-dd')}
                    onChange={e => setState(prev => ({
                      ...prev,
                      filters: { ...prev.filters, endDate: parseISO(e.target.value) }
                    }))}
                  />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group>
                  <Form.Label>Supplier</Form.Label>
                  <Form.Control
                    as="select"
                    value={state.filters.supplier}
                    onChange={e => setState(prev => ({
                      ...prev,
                      filters: { ...prev.filters, supplier: e.target.value }
                    }))}
                  >
                    <option value="all">All Suppliers</option>
                    {[...new Set(state.inventory.map(item => item.supplier_name))].map(supplier => (
                      <option key={supplier} value={supplier}>{supplier || 'Unknown'}</option>
                    ))}
                  </Form.Control>
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group>
                  <Form.Label>Status</Form.Label>
                  <Form.Control
                    as="select"
                    value={state.filters.status}
                    onChange={e => setState(prev => ({
                      ...prev,
                      filters: { ...prev.filters, status: e.target.value }
                    }))}
                  >
                    <option value="all">All Statuses</option>
                    {['', 'CHOICE', 'HOLYSHEEP', 'RETURN', 'X', 'YES'].map(status => (
                      <option key={status} value={status}>{status || 'No Status'}</option>
                    ))}
                  </Form.Control>
                </Form.Group>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {state.loading ? (
          <div className="text-center">
            <Spinner animation="border" />
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <Row className="mb-4">
              <Col md={3}>
                <Card>
                  <Card.Body>
                    <Card.Title>Total Items</Card.Title>
                    <h2>{totalItems}</h2>
                    <Card.Text>Inventory Items</Card.Text>
                  </Card.Body>
                </Card>
              </Col>
              <Col md={3}>
                <Card>
                  <Card.Body>
                    <Card.Title>Total Quantity</Card.Title>
                    <h2>{totalQuantity}</h2>
                    <Card.Text>Units in Stock</Card.Text>
                  </Card.Body>
                </Card>
              </Col>
              <Col md={3}>
                <Card>
                  <Card.Body>
                    <Card.Title>Low Stock</Card.Title>
                    <h2 className="text-danger">{lowStock}</h2>
                    <Card.Text>Items Below Threshold</Card.Text>
                  </Card.Body>
                </Card>
              </Col>
              <Col md={3}>
                <Card>
                  <Card.Body>
                    <Card.Title>Recent Activity</Card.Title>
                    <h2>{recentActivity.length}</h2>
                    <Card.Text>Recent Updates</Card.Text>
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            {/* Charts */}
            <Row className="mb-4">
              <Col md={6}>
                <Card className="h-100">
                  <Card.Body>
                    <Card.Title>Inventory Status Distribution</Card.Title>
                    <PieChart width={500} height={300}>
                      <Pie
                        data={statusData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={index} fill={colors[index % colors.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </Card.Body>
                </Card>
              </Col>

              <Col md={6}>
                <Card className="h-100">
                  <Card.Body>
                    <Card.Title>Inventory Trends</Card.Title>
                    <LineChart width={500} height={300} data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="quantity" stroke="#8884d8" />
                      <Line type="monotone" dataKey="deliveries" stroke="#82ca9d" />
                    </LineChart>
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            <Row>
              <Col md={6}>
                <Card className="h-100">
                  <Card.Body>
                    <Card.Title>Top Suppliers</Card.Title>
                    <BarChart width={500} height={300} data={supplierData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="supplier" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="total" fill="#8884d8" name="Total Quantity" />
                      <Bar dataKey="count" fill="#82ca9d" name="Delivery Count" />
                    </BarChart>
                  </Card.Body>
                </Card>
              </Col>

              <Col md={6}>
                <Card>
                  <Card.Body>
                    <Card.Title>Recent Inventory Activity</Card.Title>
                    <div className="table-responsive">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th>Last Updated</th>
                            <th>Qty</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentActivity.map(item => (
                            <tr key={item.id}>
                              <td>{item.item_description}</td>
                              <td>{format(parseISO(item.updated_at), 'MM/dd/yyyy HH:mm')}</td>
                              <td>{item.qty}</td>
                              <td>{item.refill_status || 'No Status'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          </>
        )}
      </div>
    </div>
  );
};

export default Dashboard;