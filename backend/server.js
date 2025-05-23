// =====================================================
// 📦 Import Dependencies
// =====================================================
const express = require('express');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const { format, parseISO } = require('date-fns');
const jwt = require('jsonwebtoken');
const app = express();
const bcrypt = require('bcrypt');

// Load environment variables
dotenv.config();

// =====================================================
// ⚙️ Database Configuration
// =====================================================
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  namedPlaceholders: true,
  supportBigNumbers: true,
  bigNumberStrings: true,
  typeCast: (field, next) => {
    if (field.type === 'STRING') return field.string();
    return next();
  }
});

const parseAndValidateDate = (dateString) => {
  try {
    return format(parseISO(dateString), 'yyyy-MM-dd HH:mm:ss');
  } catch (error) {
    throw new Error('Invalid date format');
  }
};

// =====================================================
// 🔒 Authentication Middlewares
// =====================================================
const middlewares = {
  authenticate: async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied' });

    try {
      const verified = jwt.verify(token, process.env.JWT_SECRET);
      req.user = verified;
      next();
    } catch (error) {
      res.status(400).json({ error: 'Invalid token' });
    }
  },

  authorize: (roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    next();
  }
};

// =====================================================
// 🔐 Authentication Helpers
// =====================================================
const authenticateUser = async (email, password) => {
  const [users] = await pool.query(
    'SELECT * FROM users WHERE email = ?', 
    [email]
  );
  
  if (!users.length) throw new Error('User not found');
  
  const user = users[0];
  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) throw new Error('Invalid password');
  
  return user;
};

// =====================================================
// 🛠️ Utility Functions
// =====================================================
const utils = {
  getPaginationParams: (req) => {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = parseInt(req.query.limit) || 100;
    return {
      limit,
      offset: (page - 1) * limit
    };
  },

  // In utils.buildSortSQL
  buildSortSQL: (req) => {
    const validColumns = [
      'delivery_date',
      'item_description', 
      'qty', 
      'date_counted',
      'created_at'
    ];
    const sortBy = validColumns.includes(req.query.sort) 
      ? req.query.sort 
      : 'created_at';
    return `ORDER BY ${sortBy} ${req.query.order === 'asc' ? 'ASC' : 'DESC'}`;
  },

  sanitizeInput: (input) => input.replace(/[^\w\s-]/gi, '').trim(),
  formatDate: (date) => format(new Date(date), 'yyyy-MM-dd HH:mm:ss')
};

// =====================================================
// ⚙️ Configure Express
// =====================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS Configuration
app.use((req, res, next) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS.split(',');
  const origin = req.headers.origin;
  
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// =====================================================
// 🔄 Authentication Routes
// =====================================================
const authRoutes = express.Router();

// Login Endpoint
authRoutes.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await authenticateUser(email, password);
    
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({ 
      user: { id: user.id, name: user.name, role: user.role },
      token 
    });
  } catch (error) {
    console.error('Login error:', error);
    const status = error.message.includes('not found') ? 404 : 401;
    res.status(status).json({ error: error.message });
  }
});

// Signup Endpoint
authRoutes.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Validation
    if (!name || name.length < 3) {
      return res.status(400).json({ error: 'Name must be at least 3 characters' });
    }
    
    if (!/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length) return res.status(409).json({ error: 'Email already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      `INSERT INTO users (name, email, password, role) 
       VALUES (?, ?, ?, 'counter')`,
      [name, email, hashedPassword]
    );

    res.status(201).json({
      message: 'User created successfully',
      user: { id: result.insertId, name, email }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// =====================================================
// 🛣️ Inventory Routes
// =====================================================
const inventoryRoutes = express.Router();
inventoryRoutes.use(middlewares.authenticate);

// GET /inventory
inventoryRoutes.get('/', async (req, res) => {
  try {
    const { limit, offset } = utils.getPaginationParams(req);
    const sortSQL = utils.buildSortSQL(req);
    const search = req.query.search || '';

    let query = `
      SELECT 
        id,
        delivery_date,
        delivery_no,
        supplier_name,
        delivery_details,
        stockman,
        item_description,
        item_code,
        color,
        qty,
        storage,
        counted_by,
        date_counted,
        recorded_by,
        refill_status,    
        date_of_refill,   
        refill_by,     
        created_at,
        updated_at
      FROM inventory
    `;

    let whereClause = '';
    const params = [];
    if (search) {
      whereClause = ` WHERE item_code LIKE ? OR delivery_no LIKE ?`;
      params.push(`%${search}%`, `%${search}%`);
    }

    query += whereClause;
    query += ` ${sortSQL} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [results] = await pool.query(query, params);
    
    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM inventory`;
    if (search) {
      countQuery += ` WHERE item_code LIKE ? OR delivery_no LIKE ?`;
    }
    
    const [countResult] = await pool.query(
      countQuery, 
      search ? [`%${search}%`, `%${search}%`] : []
    );

    const response = {
      data: results.map(item => ({
        id: item.id,
        delivery_date: item.delivery_date ? 
          format(new Date(item.delivery_date), "yyyy-MM-dd") : null,
        delivery_no: item.delivery_no,
        supplier_name: item.supplier_name,
        delivery_details: item.delivery_details,
        stockman: item.stockman,
        item_description: item.item_description,
        item_code: item.item_code,
        qty: item.qty,
        color: item.color,
        storage: item.storage,
        date_counted: item.date_counted ?
          format(new Date(item.date_counted), "yyyy-MM-dd") : null,
        counted_by: item.counted_by || '',
        recorded_by: item.recorded_by,
        // Add these fields:
        refill_status: item.refill_status || '',
        date_of_refill: item.date_of_refill ?
          format(new Date(item.date_of_refill), "yyyy-MM-dd") : null,
        refill_by: item.refill_by || '',
        created_at: format(new Date(item.created_at), "yyyy-MM-dd HH:mm:ss"),
        updated_at: format(new Date(item.updated_at), "yyyy-MM-dd HH:mm:ss")
      })),
      pagination: {
        total: countResult[0].total,
        page: Math.floor(offset / limit) + 1,
        limit,
        totalPages: Math.ceil(countResult[0].total / limit)
      }
    };
    
    console.log("Sending inventory data:", response);
    res.json(response);
  } catch (error) {
    console.error('Inventory fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// POST /inventory - Final corrected version
inventoryRoutes.post('/', middlewares.authorize(['admin']), async (req, res) => {
  try {
    // Destructure with default values
    const {
      delivery_date = null,
      delivery_no = null,
      supplier_name = null,
      delivery_details = null,
      stockman = null,
      item_description,  
      item_code = null,
      color = null,
      qty = null,
      storage = null,
      counted_by = null,
      date_counted = null
    } = req.body;

    // Validation
    if (!item_description || item_code === undefined) {
      return res.status(400).json({ 
        error: 'Item description and quantity are required',
        received: req.body
      });
    }

    // Debug log
    console.log('Inserting:', {
      delivery_no,
      supplier_name,
      delivery_details,
      stockman,
      fullBody: req.body
    });

    // Database operation
    const [result] = await pool.execute(
      `INSERT INTO inventory (
        delivery_date,
        item_description,
        delivery_no,
        supplier_name,
        delivery_details,
        stockman,
        item_code,
        color,
        qty,
        storage,
        counted_by,
        date_counted,
        recorded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        delivery_date,
        item_description,
        delivery_no,
        supplier_name,
        delivery_details,
        stockman,
        item_code,
        color,
        qty,
        storage,
        counted_by,
        date_counted,
        req.user.id
      ]
    );

    // Verify insertion
    const [newItem] = await pool.query(
      `SELECT * FROM inventory WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json(newItem[0]);

  } catch (error) {
    console.error('POST Error:', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });
    res.status(500).json({
      error: 'Database operation failed',
      details: error.message,
      receivedData: req.body
    });
  }
});
// PUT /inventory/:id
inventoryRoutes.put('/:id', middlewares.authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!updates.item_description && updates.item_code === undefined) {
      return res.status(400).json({ error: 'Item description or quantity must be provided' });
    }

    const updateFields = [];
    const params = [];
    
    if (updates.delivery_date !== undefined) {
      updateFields.push('delivery_date = ?');
      params.push(updates.delivery_date ? utils.formatDate(updates.delivery_date) : null);
    }
    
    if (updates.delivery_no !== undefined) {
      updateFields.push('delivery_no = ?');
      params.push(updates.delivery_no || null);
    }

    if (updates.supplier_name !== undefined) {
      updateFields.push('supplier_name = ?');
      params.push(updates.supplier_name || null);
    }

    if (updates.delivery_details !== undefined) {
      updateFields.push('delivery_details = ?');
      params.push(updates.delivery_details || null);
    }

    if (updates.stockman !== undefined) {
      updateFields.push('stockman = ?');
      params.push(updates.stockman || null);
    } 
    
    if (updates.item_description) {
      updateFields.push('item_description = ?');
      params.push(utils.sanitizeInput(updates.item_description));
    }

    if (updates.item_code !== undefined) {
      updateFields.push('item_code = ?');
      params.push(updates.item_code || null);
    }

    if (updates.color !== undefined) {
      updateFields.push('color = ?');
      params.push(updates.color); // Allows empty string
    }

    if (updates.qty !== undefined) {
      updateFields.push('qty = ?');
      params.push(updates.qty);
    }

    if (updates.storage !== undefined) {
      updateFields.push('storage = ?');
      params.push(updates.storage);
    }

    if (updates.date_counted) {
      updateFields.push('date_counted = ?');
      params.push(utils.formatDate(updates.date_counted));
    }
    
    if (updates.counted_by !== undefined) {
      updateFields.push('counted_by = ?');
      params.push(updates.counted_by || null);
    }
    
    if (updates.refill_status) {
      updateFields.push('refill_status = ?');
      params.push(updates.refill_status);
    }
    
    if (updates.date_of_refill) {
      updateFields.push('date_of_refill = ?');
      params.push(utils.formatDate(updates.date_of_refill));
    }
    
    // Handle refill_by - store it as a string, not as a user ID
    if (updates.refill_by !== undefined) {
      updateFields.push('refill_by = ?');
      params.push(updates.refill_by || null);
    }

    // Always update these fields
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateFields.push('edited_by = ?');
    params.push(req.user.id);
    params.push(id);

    const query = `UPDATE inventory SET ${updateFields.join(', ')} WHERE id = ?`;
    
    const [result] = await pool.execute(query, params);

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const [updatedItem] = await pool.query(`
      SELECT 
        id,
        delivery_date,
        delivery_no,
        supplier_name,
        delivery_details,
        stockman,
        item_description,
        item_code
        ${updates.color !== undefined ? ', color' : ''}
        , qty
        ${updates.storage !== undefined ? ', storage' : ''}
        ${updates.date_counted ? ', date_counted' : ''}
        ${updates.counted_by !== undefined ? ', counted_by' : ''}
        ${updates.refill_status ? ', refill_status' : ''}
        ${updates.date_of_refill ? ', date_of_refill' : ''}
        ${updates.refill_by !== undefined ? ', refill_by' : ''}
        , updated_at
      FROM inventory 
      WHERE id = ?`, 
      [id]
    );

    res.json(updatedItem[0]);
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ error: 'Failed to update item' });
  }
});


// DELETE /inventory/:id
inventoryRoutes.delete('/:id', middlewares.authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute('DELETE FROM inventory WHERE id = ?', [id]);

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// POST /inventory/:id/duplicate
inventoryRoutes.post('/:id/duplicate', middlewares.authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const [items] = await pool.query('SELECT * FROM inventory WHERE id = ?', [id]);
    
    if (!items.length) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const originalItem = items[0]; // Added this line to define originalItem

    // Change counted_by from req.user.name to req.user.id
    const [insertResult] = await pool.execute(
      `INSERT INTO inventory (
        item_description,
        qty,
        color,
        storage,
        counted_by,
        date_counted,
        recorded_by,
        edited_by,
        refill_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '')`,
      [
        originalItem.item_description,
        originalItem.qty,
        originalItem.color,
        originalItem.storage,
        req.user.id,  // Use user ID instead of name
        utils.formatDate(new Date()),
        req.user.id,
        req.user.id
      ]
    );

    if (!insertResult || !insertResult.insertId) {
      throw new Error('Failed to retrieve insertId after INSERT');
    }

    const [newItem] = await pool.query('SELECT * FROM inventory WHERE id = ?', [insertResult.insertId]);
    res.status(201).json(newItem[0]);
  } catch (error) {
    console.error('Duplicate error:', error);
    res.status(500).json({ error: 'Failed to duplicate item' });
  }
});

// POST /inventory/:id/refill
inventoryRoutes.post('/:id/refill', middlewares.authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { refill_status } = req.body;
    
    if (!refill_status) {
      return res.status(400).json({ error: 'Refill status is required' });
    }

    // Change refill_by from req.user.name to req.user.id
    const [result] = await pool.execute(
      `UPDATE inventory SET 
        refill_status = ?,
        date_of_refill = ?,
        refill_by = ?,
        edited_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        refill_status,
        utils.formatDate(new Date()),
        req.user.id,  // Use user ID instead of name
        req.user.id,
        id
      ]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const [updatedItem] = await pool.query('SELECT * FROM inventory WHERE id = ?', [id]);
    res.json(updatedItem[0]);
  } catch (error) {
    console.error('Refill update error:', error);
    res.status(500).json({ error: 'Failed to update refill status' });
  }
});

// =====================================================
// 🔍 Database Connection Test
// =====================================================
async function testDatabaseConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connection successful');
    connection.release();
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

// =====================================================
// 📌 Mount Routes
// =====================================================
app.use('/auth', authRoutes);
app.use('/inventory', inventoryRoutes);

// =====================================================
// 🏁 Start Server
// =====================================================
const PORT = process.env.PORT || 5000;
testDatabaseConnection().then(() => {
  const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`${signal} received. Shutting down...`);
    server.close(() => {
      pool.end();
      console.log('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
});