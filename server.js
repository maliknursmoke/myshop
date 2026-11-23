
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY;

const DATA_DIR = path.join(__dirname, "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(ORDERS_FILE)) {
  fs.writeFileSync(ORDERS_FILE, "[]");
}

// Sample products
const products = [
  {
    id: 1,
    name: "Classic T-Shirt",
    price: 850,
    category: "Clothing",
    image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600",
    description: "Comfortable everyday cotton T-shirt"
  },
  {
    id: 2,
    name: "Premium Sneakers",
    price: 2500,
    category: "Shoes",
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600",
    description: "Modern and comfortable sneakers"
  },
  {
    id: 3,
    name: "Luxury Watch",
    price: 3200,
    category: "Accessories",
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600",
    description: "Stylish everyday wristwatch"
  },
  {
    id: 4,
    name: "Travel Backpack",
    price: 1800,
    category: "Accessories",
    image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600",
    description: "Practical backpack for everyday use"
  },
  {
    id: 5,
    name: "Headphones",
    price: 2100,
    category: "Electronics",
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600",
    description: "Wireless-style audio headphones"
  },
  {
    id: 6,
    name: "Smartphone",
    price: 12500,
    category: "Electronics",
    image: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600",
    description: "Modern smartphone"
  }
];

// Get products
app.get("/api/products", (req, res) => {
  res.json(products);
});

// Create an order
app.post("/api/orders", (req, res) => {
  try {
    const { customer, items, paymentMethod } = req.body;

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

    let orderItems = [];
    let total = 0;

    for (const item of items) {
      const product = products.find(
        p => p.id === Number(item.id)
      );
      const quantity = Number(item.quantity);

      if (!product || !Number.isInteger(quantity) ||
          quantity < 1 || quantity > 20) {
        return res.status(400).json({
          error: "Invalid product or quantity."
        });
      }

      orderItems.push({
        id: product.id,
        name: product.name,
        price: product.price,
        quantity: quantity
      });

      total += product.price * quantity;
    }

    const allowedPayments = ["Cash on Delivery", "Bank Transfer"];
    if (!allowedPayments.includes(paymentMethod)) {
      return res.status(400).json({
        error: "Invalid payment method."
      });
    }

    const orders = JSON.parse(
      fs.readFileSync(ORDERS_FILE, "utf8")
    );

    const order = {
      id: crypto.randomUUID(),
      customer: { name, phone, address },
      items: orderItems,
      total,
      paymentMethod,
      status: "Pending",
      createdAt: new Date().toISOString()
    };

    orders.push(order);

    fs.writeFileSync(
      ORDERS_FILE,
      JSON.stringify(orders, null, 2)
    );

    res.status(201).json({
      message: "Your order was received!",
      orderId: order.id,
      total: order.total
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to save order." });
  }
});

// Admin: list all orders
app.get("/api/admin/orders", (req, res) => {
  if (!ADMIN_KEY ||
      req.get("x-admin-key") !== ADMIN_KEY) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  const orders = JSON.parse(
    fs.readFileSync(ORDERS_FILE, "utf8")
  );

  res.json(orders);
});

// Admin: update order status
app.patch("/api/admin/orders/:id", (req, res) => {
  if (!ADMIN_KEY ||
      req.get("x-admin-key") !== ADMIN_KEY) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  const allowed = ["Pending", "Confirmed", "Shipped", "Delivered", "Cancelled"];
  const status = req.body.status;

  if (!allowed.includes(status)) {
    return res.status(400).json({
      error: "Invalid order status."
    });
  }

  const orders = JSON.parse(
    fs.readFileSync(ORDERS_FILE, "utf8")
  );

  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.status(404).json({
      error: "Order not found."
    });
  }

  order.status = status;

  fs.writeFileSync(
    ORDERS_FILE,
    JSON.stringify(orders, null, 2)
  );

  res.json({ message: "Order updated.", order });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log("MYSHOP SERVER RUNNING");
  console.log("http://127.0.0.1:" + PORT);
});
