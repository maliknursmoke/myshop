const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL ||
    !process.env.ADMIN_PASSWORD_HASH ||
    !process.env.SESSION_SECRET) {
  throw new Error("Missing DATABASE_URL, ADMIN_PASSWORD_HASH or SESSION_SECRET");
}

app.set("trust proxy", 1);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false
});

app.use(express.json({ limit: "20kb" }));

app.use(session({
  store: new PgSession({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 8 * 60 * 60 * 1000
  }
}));

app.use(express.static(path.join(__dirname, "public")));
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});
// -------------------- ADMIN AUTHENTICATION --------------------

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: "Please log in." });
}

app.post("/api/admin/login", async (req, res) => {
  try {
    const username = String(req.body.username || "");
    const password = String(req.body.password || "");

    const expectedUsername = process.env.ADMIN_USERNAME || "admin";

    if (username !== expectedUsername ||
        !await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH)) {
      return res.status(401).json({ error: "Incorrect username or password." });
    }

    req.session.regenerate(error => {
      if (error) {
        return res.status(500).json({ error: "Login failed." });
      }

      req.session.isAdmin = true;

      req.session.save(error => {
        if (error) return res.status(500).json({ error: "Login failed." });
        res.json({ message: "Login successful." });
      });
    });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ error: "Login failed." });
  }
});

app.get("/api/admin/me", (req, res) => {
  res.json({ authenticated: Boolean(req.session?.isAdmin) });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(error => {
    if (error) return res.status(500).json({ error: "Logout failed." });
    res.clearCookie("connect.sid");
    res.json({ message: "Logged out." });
  });
});

// -------------------- DATABASE SETUP --------------------

// -------------------- CUSTOMER AUTHENTICATION --------------------

function requireCustomer(req, res, next) {
  if (req.session && req.session.customerId) {
    return next();
  }
  return res.status(401).json({ error: "Please log in to your customer account." });
}

// Register a customer
app.post("/api/customer/register", async (req, res) => {
  try {
    const fullName = String(req.body.fullName || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const phone = String(req.body.phone || "").trim();
    const password = String(req.body.password || "");

    if (fullName.length < 2 || fullName.length > 100) {
      return res.status(400).json({ error: "Enter a valid full name." });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }

    if (!/^[0-9+()\-\s]{7,20}$/.test(phone)) {
      return res.status(400).json({ error: "Enter a valid phone number." });
    }

    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({
        error: "Password must contain 8 to 72 characters."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO customers (full_name, email, phone, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, email, phone`,
      [fullName, email, phone, passwordHash]
    );

    const customer = result.rows[0];

    req.session.regenerate(error => {
      if (error) {
        return res.status(500).json({ error: "Registration failed." });
      }

      req.session.customerId = customer.id;

      req.session.save(error => {
        if (error) {
          return res.status(500).json({ error: "Registration failed." });
        }

        res.status(201).json({
          message: "Account created successfully.",
          customer
        });
      });
    });

  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "This email is already registered." });
    }

    console.error("Customer registration error:", error.message);
    res.status(500).json({ error: "Unable to create account." });
  }
});

// Customer login
app.post("/api/customer/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    const result = await pool.query(
      `SELECT id, full_name, email, phone, password_hash
       FROM customers WHERE email = $1`,
      [email]
    );

    const customer = result.rows[0];

    if (!customer || !await bcrypt.compare(password, customer.password_hash)) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    req.session.regenerate(error => {
      if (error) {
        return res.status(500).json({ error: "Login failed." });
      }

      req.session.customerId = customer.id;

      req.session.save(error => {
        if (error) {
          return res.status(500).json({ error: "Login failed." });
        }

        res.json({
          message: "Login successful.",
          customer: {
            id: customer.id,
            fullName: customer.full_name,
            email: customer.email,
            phone: customer.phone
          }
        });
      });
    });

  } catch (error) {
    console.error("Customer login error:", error.message);
    res.status(500).json({ error: "Unable to log in." });
  }
});

// Get current customer account
app.get("/api/customer/me", requireCustomer, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name AS "fullName", email, phone, created_at AS "createdAt"
       FROM customers WHERE id = $1`,
      [req.session.customerId]
    );

    if (!result.rows[0]) {
      return res.status(401).json({ error: "Customer account not found." });
    }

    res.json({ customer: result.rows[0] });
  } catch (error) {
    console.error("Customer account error:", error.message);
    res.status(500).json({ error: "Unable to load account." });
  }
});

// Customer logout
app.post("/api/customer/logout", requireCustomer, (req, res) => {
  req.session.customerId = null;

  req.session.save(error => {
    if (error) {
      return res.status(500).json({ error: "Logout failed." });
    }

    res.json({ message: "Logged out successfully." });
  });
});

const initialProducts = [
  {
    id: 1,
    name: "Classic T-Shirt",
    price: 850,
    category: "Clothing",
    image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600",
    description: "Comfortable everyday cotton T-shirt",
    stock: 20
  },
  {
    id: 2,
    name: "Premium Sneakers",
    price: 2500,
    category: "Shoes",
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600",
    description: "Modern and comfortable sneakers",
    stock: 20
  },
  {
    id: 3,
    name: "Luxury Watch",
    price: 3200,
    category: "Accessories",
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600",
    description: "Stylish everyday wristwatch",
    stock: 20
  },
  {
    id: 4,
    name: "Travel Backpack",
    price: 1800,
    category: "Accessories",
    image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600",
    description: "Practical backpack for everyday use",
    stock: 20
  },
  {
    id: 5,
    name: "Headphones",
    price: 2100,
    category: "Electronics",
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600",
    description: "Wireless-style audio headphones",
    stock: 20
  },
  {
    id: 6,
    name: "Smartphone",
    price: 12500,
    category: "Electronics",
    image: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600",
    description: "Modern smartphone",
    stock: 20
  }
];

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
      category VARCHAR(80) NOT NULL,
      image TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      phone VARCHAR(20) NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customer JSONB NOT NULL,
      items JSONB NOT NULL,
      total NUMERIC(12,2) NOT NULL,
      payment_method VARCHAR(80) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'Pending',
      created_at TIMESTAMPTZ NOT NULL
    )
  `);

  await pool.query(`
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS customer_id INTEGER
    REFERENCES customers(id) ON DELETE SET NULL
  `);


  const count = await pool.query("SELECT COUNT(*) FROM products");

  if (Number(count.rows[0].count) === 0) {
    for (const p of initialProducts) {
      await pool.query(
        `INSERT INTO products
         (id, name, price, category, image, description, stock)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [p.id, p.name, p.price, p.category, p.image, p.description, p.stock]
      );
    }

    await pool.query(`
      SELECT setval(
        pg_get_serial_sequence('products', 'id'),
        COALESCE((SELECT MAX(id) FROM products), 1)
      )
    `);
  }

  // Import old JSON orders, if present and not already imported.
  const oldOrdersFile = path.join(__dirname, "data", "orders.json");

  if (fs.existsSync(oldOrdersFile)) {
    try {
      const oldOrders = JSON.parse(fs.readFileSync(oldOrdersFile, "utf8"));

      if (Array.isArray(oldOrders)) {
        for (const order of oldOrders) {
          if (!order.id || !order.customer || !Array.isArray(order.items)) continue;


            await pool.query(
              `INSERT INTO orders
               (id, customer, items, total, payment_method, status, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7)
               ON CONFLICT (id) DO NOTHING`,
              [
                String(order.id),
                JSON.stringify(order.customer),
                JSON.stringify(order.items),
                Number(order.total) || 0,
                order.paymentMethod || "Cash on Delivery",
                order.status || "Pending",
                order.createdAt || new Date().toISOString()
              ]
            );



        }
      }
    } catch (error) {
      console.error("Old order import error:", error.message);
    }
  }

  console.log("MYSHOP PostgreSQL database is ready.");
}

// -------------------- TELEGRAM NOTIFICATION --------------------

async function sendTelegramNotification(order) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("Telegram credentials are missing.");
    return;
  }

  const itemLines = order.items.map(item =>
    `- ${item.name} x ${item.quantity} = ${item.price * item.quantity} ETB`
  );

  const message = [
    "🛍️ MYSHOP - NEW ORDER!",
    "",
    `Order ID: ${order.id}`,
    `Customer: ${order.customer.name}`,
    `Phone: ${order.customer.phone}`,
    `Address: ${order.customer.address}`,
    "",
    "Products:",
    ...itemLines,
    "",
    `Total: ${order.total} ETB`,
    `Payment: ${order.paymentMethod}`,
    `Status: ${order.status}`,
    `Date: ${order.createdAt}`
  ].join("\n");

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message })
    }
  );

  const result = await response.json();

  if (response.status === 429) {
    const waitSeconds = Number(result.parameters?.retry_after || 30);
    console.warn(`Telegram rate limited. Retry after ${waitSeconds} seconds.`);
    return;
  }

  if (!response.ok || !result.ok) {
    throw new Error(result.description || "Telegram notification failed");
  }

  console.log("Telegram order notification sent.");
}

// -------------------- PUBLIC PRODUCTS --------------------

app.get("/api/products", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, price, category, image, description, stock
       FROM products
       WHERE active = TRUE
       ORDER BY id`
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load products." });
  }
});

// -------------------- CUSTOMER ORDERS --------------------

app.post("/api/orders", async (req, res) => {
  try {
    const { customer, items, paymentMethod } = req.body;
const customerId = req.session?.customerId || null;
    if (!customer || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: "Customer details and products are required."
      });
    }

    const name = String(customer.name || "").trim();
    const phone = String(customer.phone || "").trim();
    const address = String(customer.address || "").trim();

    if (name.length < 2 || name.length > 80 ||
        !/^[0-9+()\-\s]{7,20}$/.test(phone) ||
        address.length < 5 || address.length > 300) {
      return res.status(400).json({
        error: "Please provide valid customer details."
      });
    }

    if (items.length > 20) {
      return res.status(400).json({ error: "Too many products." });
    }

    const allowedPayments = ["Cash on Delivery", "Bank Transfer"];

    if (!allowedPayments.includes(paymentMethod)) {
      return res.status(400).json({ error: "Invalid payment method." });
    }

    const orderItems = [];
    let total = 0;

    for (const item of items) {
      const quantity = Number(item.quantity);
      const productResult = await pool.query(
        "SELECT id, name, price, stock FROM products WHERE id=$1 AND active=TRUE",
        [Number(item.id)]
      );

      const product = productResult.rows[0];

      if (!product || !Number.isInteger(quantity) ||
          quantity < 1 || quantity > 20) {
        return res.status(400).json({
          error: "Invalid product or quantity."
        });
      }

      if (product.stock < quantity) {
        return res.status(400).json({
          error: `Not enough stock for ${product.name}.`
        });
      }

      const price = Number(product.price);

      orderItems.push({
        id: product.id,
        name: product.name,
        price,
        quantity
      });

      total += price * quantity;
    }

    const order = {
      id: crypto.randomUUID(),
      customer: { name, phone, address },
      items: orderItems,
      total,
      paymentMethod,
      status: "Pending",
      createdAt: new Date().toISOString()
    };

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      for (const item of orderItems) {
        const updated = await client.query(
          `UPDATE products SET stock = stock - $1
           WHERE id = $2 AND active = TRUE AND stock >= $1`,
          [item.quantity, item.id]
        );

        if (updated.rowCount !== 1) {
          throw new Error(`Stock changed for ${item.name}. Please try again.`);
        }
      }

        await client.query(
          `INSERT INTO orders
           (id, customer_id, customer, items, total, payment_method, status, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            order.id,
            customerId,
            JSON.stringify(order.customer),
            JSON.stringify(order.items),
            order.total,
            order.paymentMethod,
            order.status,
            order.createdAt
          ]
        );


      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    sendTelegramNotification(order).catch(error => {
      console.error("Telegram notification error:", error.message);
    });

    res.status(201).json({
      message: "Your order was received!",
      orderId: order.id,
      total: order.total
    });
  } catch (error) {
    console.error("Order error:", error.message);
    res.status(500).json({ error: error.message || "Unable to save order." });
  }
});

// -------------------- ADMIN PRODUCT MANAGEMENT --------------------

// -------------------- CUSTOMER ORDER HISTORY --------------------

app.get("/api/customer/orders", requireCustomer, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         id,
         customer,
         items,
         total,
         payment_method AS "paymentMethod",
         status,
         created_at AS "createdAt"
       FROM orders
       WHERE customer_id = $1
       ORDER BY created_at DESC`,
      [req.session.customerId]
    );

    res.json({ orders: result.rows });
  } catch (error) {
    console.error("Customer order history error:", error.message);
    res.status(500).json({ error: "Unable to load your orders." });
  }
});

function validProduct(body) {
  const name = String(body.name || "").trim();
  const category = String(body.category || "").trim();
  const image = String(body.image || "").trim();
  const description = String(body.description || "").trim();
  const price = Number(body.price);
  const stock = Number(body.stock);

  if (!name || name.length > 120 ||
      !category || category.length > 80 ||
      !image || image.length > 2000 ||
      !Number.isFinite(price) || price < 0 ||
      !Number.isInteger(stock) || stock < 0 ||
      stock > 1000000 ||
      description.length > 2000) {
    return null;
  }

  return { name, category, image, description, price, stock };
}

app.get("/api/admin/products", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM products ORDER BY id DESC");
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Could not load products." });
  }
});

app.post("/api/admin/products", requireAdmin, async (req, res) => {
  const p = validProduct(req.body);
  if (!p) return res.status(400).json({ error: "Please check product details." });

  try {
    const result = await pool.query(
      `INSERT INTO products
       (name, price, category, image, description, stock)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [p.name, p.price, p.category, p.image, p.description, p.stock]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not add product." });
  }
});

app.put("/api/admin/products/:id", requireAdmin, async (req, res) => {
  const p = validProduct(req.body);
  if (!p) return res.status(400).json({ error: "Please check product details." });

  try {
    const result = await pool.query(
      `UPDATE products
       SET name=$1, price=$2, category=$3, image=$4,
           description=$5, stock=$6
       WHERE id=$7 RETURNING *`,
      [p.name, p.price, p.category, p.image, p.description, p.stock, req.params.id]
    );

    if (!result.rowCount) return res.status(404).json({ error: "Product not found." });
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not update product." });
  }
});

app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM products WHERE id=$1 RETURNING id",
      [req.params.id]
    );

    if (!result.rowCount) return res.status(404).json({ error: "Product not found." });
    res.json({ message: "Product deleted." });
  } catch (error) {
    res.status(500).json({ error: "Could not delete product." });
  }
});

app.patch("/api/admin/products/:id/availability", requireAdmin, async (req, res) => {
  try {
    const active = Boolean(req.body.active);
    const result = await pool.query(
      "UPDATE products SET active=$1 WHERE id=$2 RETURNING *",
      [active, req.params.id]
    );

    if (!result.rowCount) return res.status(404).json({ error: "Product not found." });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Could not update availability." });
  }
});

// -------------------- ADMIN ORDERS --------------------

app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM orders ORDER BY created_at DESC");
    res.json(result.rows.map(row => ({
      id: row.id,
      customer: row.customer,
      items: row.items,
      total: Number(row.total),
      paymentMethod: row.payment_method,
      status: row.status,
      createdAt: row.created_at
    })));
  } catch (error) {
    res.status(500).json({ error: "Could not load orders." });
  }
});

app.patch("/api/admin/orders/:id", requireAdmin, async (req, res) => {
  const allowed = ["Pending", "Confirmed", "Shipped", "Delivered", "Cancelled"];
  const status = req.body.status;

  if (!allowed.includes(status)) {
    return res.status(400).json({ error: "Invalid order status." });
  }

  try {
    const result = await pool.query(
      "UPDATE orders SET status=$1 WHERE id=$2 RETURNING *",
      [status, req.params.id]
    );

    if (!result.rowCount) return res.status(404).json({ error: "Order not found." });
    res.json({ message: "Order updated.", order: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Could not update order." });
  }
});

// -------------------- START SERVER --------------------

async function startServer() {
  try {
    await pool.query("SELECT 1");
    await initializeDatabase();

    app.listen(PORT, "0.0.0.0", () => {
      console.log("MYSHOP SERVER RUNNING");
      console.log("Port:", PORT);
    });
  } catch (error) {
    console.error("MYSHOP startup failed:", error);
    process.exit(1);
  }
}

startServer();
