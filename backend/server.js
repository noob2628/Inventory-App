// =====================================================
// 📦 Import Dependencies
// =====================================================
const express = require('express');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const { format, parseISO } = require('date-fns');
const jwt = require('jsonwebtoken');
const app = express();
const bcrypt = require('bcrypt');

// Load environment variables
dotenv.config();

// =====================================================
// ⚙️ Database Configuration (PostgreSQL / Neon)
// =====================================================
const pool = new Pool({
  host: process.env.DB_HOST,         // e.g. ep-round-mouse-a43p8m0c-pooler.us-east-1.aws.neon.tech
  port: process.env.DB_PORT,         // 5432 (default for Postgres)
  user: process.env.DB_USER,         // neondb_owner
  password: process.env.DB_PASSWORD, // npg_t5dzueXZn0GU
  database: process.env.DB_NAME,     // neondb
  ssl: {
    rejectUnauthorized: false,       // Neon requires SSL; false allows Neon’s self‐signed cert
  },
  max: 10,                           // connectionLimit equivalent
  idleTimeoutMillis: 30000,          // close idle clients after 30s
  connectionTimeoutMillis: 2000,     // return an error after 2s if connection could not be established
});

// Helper to run a parameterized query
async function query(text, params) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}

// =====================================================
// 🔍 Database Connection Test
// =====================================================
async function testDatabaseConnection() {
  try {
    // With pg, use pool.connect() rather than pool.getConnection()
    const client = await pool.connect();
    console.log('✅ Database connection successful');
    client.release();
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

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
  // SELECT users by email
  const { rows } = await query(
    'SELECT id, username, email, password, role FROM users WHERE email = $1',
    [email]
  );

  if (!rows.length) throw new Error('User not found');
  const user = rows[0];
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
    return `ORDER BY "${sortBy}" ${req.query.order === 'asc' ? 'ASC' : 'DESC'}`;
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
      user: { id: user.id, name: user.username, role: user.role },
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
    const { username, email, password } = req.body;

    // Basic validation
    if (!username || username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (!/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check for existing user
    const { rows: existing } = await query(
      'SELECT email, username FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );
    if (existing.length) {
      const conflictField = existing[0].email === email ? 'email' : 'username';
      return res.status(409).json({
        error: `${conflictField} already exists`,
        field: conflictField
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user
    const { rows: insertResult } = await query(
      `INSERT INTO users (username, email, password, role)
       VALUES ($1, $2, $3, 'user')
       RETURNING id, username, email, role`,
      [username, email, hashedPassword]
    );

    const newUser = insertResult[0];
    const token = jwt.sign(
      { id: newUser.id, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(201).json({
      message: 'User created successfully',
      user: newUser,
      token
    });
  } catch (error) {
    console.error('Signup error:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({
      error: 'Registration failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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

    let baseQuery = `
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
    const params = [];
    let whereClause = '';

    if (search) {
      whereClause = ` WHERE item_code ILIKE $1 OR delivery_no ILIKE $2 `;
      params.push(`%${search}%`, `%${search}%`);
    }

    baseQuery += whereClause + ` ${sortSQL} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    // Fetch rows
    const { rows: results } = await query(baseQuery, params);

    // Count total
    let countQuery = `SELECT COUNT(*) AS total FROM inventory`;
    if (search) {
      countQuery += ` WHERE item_code ILIKE $1 OR delivery_no ILIKE $2`;
    }
    const countParams = search ? [`%${search}%`, `%${search}%`] : [];
    const { rows: countResult } = await query(countQuery, countParams);

    const response = {
      data: results.map(item => ({
        id: item.id,
        delivery_date: item.delivery_date
          ? format(new Date(item.delivery_date), 'yyyy-MM-dd')
          : null,
        delivery_no: item.delivery_no,
        supplier_name: item.supplier_name,
        delivery_details: item.delivery_details,
        stockman: item.stockman,
        item_description: item.item_description,
        item_code: item.item_code,
        qty: item.qty,
        color: item.color,
        storage: item.storage,
        date_counted: item.date_counted
          ? format(new Date(item.date_counted), 'yyyy-MM-dd')
          : null,
        counted_by: item.counted_by || '',
        recorded_by: item.recorded_by,
        refill_status: item.refill_status || '',
        date_of_refill: item.date_of_refill
          ? format(new Date(item.date_of_refill), 'yyyy-MM-dd')
          : null,
        refill_by: item.refill_by || '',
        created_at: format(new Date(item.created_at), 'yyyy-MM-dd HH:mm:ss'),
        updated_at: format(new Date(item.updated_at), 'yyyy-MM-dd HH:mm:ss')
      })),
      pagination: {
        total: parseInt(countResult[0].total, 10),
        page: Math.floor(offset / limit) + 1,
        limit,
        totalPages: Math.ceil(parseInt(countResult[0].total, 10) / limit)
      }
    };

    console.log('Sending inventory data:', response);
    res.json(response);
  } catch (error) {
    console.error('Inventory fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// POST /inventory
inventoryRoutes.post('/', middlewares.authorize(['admin']), async (req, res) => {
  try {
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

    if (!item_description || item_code === undefined) {
      return res.status(400).json({
        error: 'Item description and quantity are required',
        received: req.body
      });
    }

    console.log('Inserting:', {
      delivery_no,
      supplier_name,
      delivery_details,
      stockman,
      fullBody: req.body
    });

    // INSERT INTO inventory (...) RETURNING *
    const insertText = `
      INSERT INTO inventory (
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
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12, $13
      ) RETURNING *;
    `;
    const insertParams = [
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
    ];

    const { rows: insertedRows } = await query(insertText, insertParams);
    res.status(201).json(insertedRows[0]);
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

    // Build SET clause dynamically
    const setClauses = [];
    const params = [];
    let idx = 1;

    if (updates.delivery_date !== undefined) {
      setClauses.push(`delivery_date = $${idx++}`);
      params.push(updates.delivery_date ? utils.formatDate(updates.delivery_date) : null);
    }
    if (updates.delivery_no !== undefined) {
      setClauses.push(`delivery_no = $${idx++}`);
      params.push(updates.delivery_no || null);
    }
    if (updates.supplier_name !== undefined) {
      setClauses.push(`supplier_name = $${idx++}`);
      params.push(updates.supplier_name || null);
    }
    if (updates.delivery_details !== undefined) {
      setClauses.push(`delivery_details = $${idx++}`);
      params.push(updates.delivery_details || null);
    }
    if (updates.stockman !== undefined) {
      setClauses.push(`stockman = $${idx++}`);
      params.push(updates.stockman || null);
    }
    if (updates.item_description) {
      setClauses.push(`item_description = $${idx++}`);
      params.push(utils.sanitizeInput(updates.item_description));
    }
    if (updates.item_code !== undefined) {
      setClauses.push(`item_code = $${idx++}`);
      params.push(updates.item_code || null);
    }
    if (updates.color !== undefined) {
      setClauses.push(`color = $${idx++}`);
      params.push(updates.color);
    }
    if (updates.qty !== undefined) {
      setClauses.push(`qty = $${idx++}`);
      params.push(updates.qty);
    }
    if (updates.storage !== undefined) {
      setClauses.push(`storage = $${idx++}`);
      params.push(updates.storage);
    }
    if (updates.date_counted) {
      setClauses.push(`date_counted = $${idx++}`);
      params.push(utils.formatDate(updates.date_counted));
    }
    if (updates.counted_by !== undefined) {
      setClauses.push(`counted_by = $${idx++}`);
      params.push(updates.counted_by || null);
    }
    if (updates.refill_status) {
      setClauses.push(`refill_status = $${idx++}`);
      params.push(updates.refill_status);
    }
    if (updates.date_of_refill) {
      setClauses.push(`date_of_refill = $${idx++}`);
      params.push(utils.formatDate(updates.date_of_refill));
    }
    if (updates.refill_by !== undefined) {
      setClauses.push(`refill_by = $${idx++}`);
      params.push(updates.refill_by || null);
    }

    // Always update these fields:
    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
    setClauses.push(`edited_by = $${idx++}`);
    params.push(req.user.id);

    // Finally add the WHERE id
    params.push(id);

    const updateText = `
      UPDATE inventory
      SET ${setClauses.join(', ')}
      WHERE id = $${idx}
      RETURNING *;
    `;

    const { rows: updatedRows } = await query(updateText, params);
    if (!updatedRows.length) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(updatedRows[0]);
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// DELETE /inventory/:id
inventoryRoutes.delete('/:id', middlewares.authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await query('DELETE FROM inventory WHERE id = $1', [id]);

    if (rowCount === 0) {
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
    const { rows: items } = await query('SELECT * FROM inventory WHERE id = $1', [id]);

    if (!items.length) {
      return res.status(404).json({ error: 'Item not found' });
    }
    const originalItem = items[0];

    const insertText = `
      INSERT INTO inventory (
        item_description,
        qty,
        color,
        storage,
        counted_by,
        date_counted,
        recorded_by,
        edited_by,
        refill_status,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ) RETURNING *;
    `;
    const insertParams = [
      originalItem.item_description,
      originalItem.qty,
      originalItem.color,
      originalItem.storage,
      req.user.id,                // counted_by = current user
      utils.formatDate(new Date()),
      req.user.id,                // recorded_by = current user
      req.user.id                 // edited_by = current user
    ];

    const { rows: newRows } = await query(insertText, insertParams);
    res.status(201).json(newRows[0]);
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

    const updateText = `
      UPDATE inventory SET
        refill_status = $1,
        date_of_refill = $2,
        refill_by = $3,
        edited_by = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *;
    `;
    const updateParams = [
      refill_status,
      utils.formatDate(new Date()),
      req.user.id,
      req.user.id,
      id
    ];

    const { rows: updatedRows } = await query(updateText, updateParams);
    if (!updatedRows.length) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(updatedRows[0]);
  } catch (error) {
    console.error('Refill update error:', error);
    res.status(500).json({ error: 'Failed to update refill status' });
  }
});

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
