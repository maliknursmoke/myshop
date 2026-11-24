const loginSection = document.getElementById("loginSection");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("loginForm");
const productForm = document.getElementById("productForm");
const productList = document.getElementById("productList");
const orderList = document.getElementById("orderList");
const orderSummary = document.getElementById("orderSummary");

const loginMessage = document.getElementById("loginMessage");
const formMessage = document.getElementById("formMessage");

const orderStatuses = [
  "Pending",
  "Confirmed",
  "Shipped",
  "Delivered",
  "Cancelled"
];

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(options.body ? { "Content-Type": "application/json" } : {})
    }
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Request failed.");
  }

  return result;
}

function showDashboard() {
  loginSection.hidden = true;
  dashboard.hidden = false;
  loadProducts();
  loadOrders();
}

async function checkLogin() {
  try {
    const result = await api("/api/admin/me");

    if (result.authenticated) {
      showDashboard();
    } else {
      loginSection.hidden = false;
      dashboard.hidden = true;
    }
  } catch (error) {
    loginMessage.textContent = error.message;
  }
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  loginMessage.textContent = "Logging in...";

  const data = {
    username: loginForm.elements.username.value.trim(),
    password: loginForm.elements.password.value
  };

  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify(data)
    });

    loginForm.reset();
    showDashboard();
  } catch (error) {
    loginMessage.textContent = error.message;
  }
});

// ---------------- ORDER MANAGEMENT ----------------

function makeElement(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

async function loadOrders() {
  orderList.textContent = "Loading customer orders...";
  orderSummary.textContent = "";

  try {
    const orders = await api("/api/admin/orders");

    orderSummary.textContent =
      "Total orders: " + orders.length +
      " | Pending: " + orders.filter(o => o.status === "Pending").length +
      " | Confirmed: " + orders.filter(o => o.status === "Confirmed").length +
      " | Shipped: " + orders.filter(o => o.status === "Shipped").length +
      " | Delivered: " + orders.filter(o => o.status === "Delivered").length;

    orderList.replaceChildren();

    if (!orders.length) {
      orderList.textContent = "No customer orders yet.";
      return;
    }

    orders.forEach(order => {
      const card = makeElement("article", undefined, "order-card");

      const heading = makeElement(
        "h3",
        "Order #" + String(order.id).slice(0, 8)
      );

      const date = makeElement(
        "p",
        "Date: " + (
          order.createdAt
            ? new Date(order.createdAt).toLocaleString()
            : "Not available"
        )
      );

      const customer = order.customer || {};

      const customerHeading = makeElement("h4", "Customer Details");
      const customerName = makeElement("p", "Name: " + (customer.name || "N/A"));
      const customerPhone = makeElement("p", "Phone: " + (customer.phone || "N/A"));
      const customerAddress = makeElement(
        "p",
        "Delivery address: " + (customer.address || "N/A")
      );

      const itemsHeading = makeElement("h4", "Ordered Products");
      const itemsList = makeElement("ul");

      (Array.isArray(order.items) ? order.items : []).forEach(item => {
        const itemText =
          (item.name || "Product") +
          " × " + Number(item.quantity || 0) +
          " — " + (Number(item.price || 0) * Number(item.quantity || 0)).toLocaleString() +
          " ETB";

        itemsList.appendChild(makeElement("li", itemText));
      });

      const total = makeElement(
        "p",
        "Total: " + Number(order.total || 0).toLocaleString() + " ETB",
        "order-total"
      );

      const payment = makeElement(
        "p",
        "Payment method: " + (order.paymentMethod || "N/A")
      );

      const statusLabel = makeElement(
        "label",
        "Order status: "
      );

      const statusSelect = document.createElement("select");

      orderStatuses.forEach(status => {
        const option = document.createElement("option");
        option.value = status;
        option.textContent = status;
        option.selected = status === order.status;
        statusSelect.appendChild(option);
      });

      statusLabel.appendChild(statusSelect);

      const updateButton = makeElement("button", "Update Status");
      updateButton.addEventListener("click", async () => {
        updateButton.disabled = true;
        updateButton.textContent = "Updating...";

        try {
          await api(
            "/api/admin/orders/" + encodeURIComponent(order.id),
            {
              method: "PATCH",
              body: JSON.stringify({ status: statusSelect.value })
            }
          );

          await loadOrders();
        } catch (error) {
          alert(error.message);
          updateButton.disabled = false;
          updateButton.textContent = "Update Status";
        }
      });

      card.append(
        heading,
        date,
        customerHeading,
        customerName,
        customerPhone,
        customerAddress,
        itemsHeading,
        itemsList,
        total,
        payment,
        statusLabel,
        updateButton
      );

      orderList.appendChild(card);
    });

  } catch (error) {
    orderList.textContent = "Could not load orders: " + error.message;
  }
}

document.getElementById("refreshOrdersButton")
  .addEventListener("click", loadOrders);

// ---------------- PRODUCT MANAGEMENT ----------------

async function loadProducts() {
  productList.textContent = "Loading products...";

  try {
    const products = await api("/api/admin/products");
    productList.replaceChildren();

    if (!products.length) {
      productList.textContent = "No products yet. Add your first product above.";
      return;
    }

    products.forEach(product => {
      const card = document.createElement("article");
      card.className = "product";

      const image = document.createElement("img");
      image.src = product.image;
      image.alt = product.name;
      image.loading = "lazy";

      const details = document.createElement("div");
      details.className = "details";

      const name = makeElement("h3", product.name);
      const category = makeElement("p", "Category: " + product.category);
      const price = makeElement(
        "p",
        Number(product.price).toLocaleString() + " ETB"
      );
      const stock = makeElement("p", "Stock: " + product.stock);

      const status = makeElement(
        "p",
        product.active ? "Available" : "Hidden",
        product.active ? "available" : "hidden-status"
      );

      const edit = makeElement("button", "Edit");
      edit.addEventListener("click", () => editProduct(product));

      const toggle = makeElement(
        "button",
        product.active ? "Hide" : "Show",
        "secondary"
      );
      toggle.addEventListener("click", () => toggleProduct(product));

      const remove = makeElement("button", "Delete", "danger");
      remove.addEventListener("click", () => deleteProduct(product));

      details.append(name, category, price, stock, status, edit, toggle, remove);
      card.append(image, details);
      productList.append(card);
    });
  } catch (error) {
    productList.textContent = error.message;
  }
}

function editProduct(product) {
  productForm.elements.id.value = product.id;
  productForm.elements.name.value = product.name;
  productForm.elements.price.value = product.price;
  productForm.elements.category.value = product.category;
  productForm.elements.image.value = product.image;
  productForm.elements.description.value = product.description || "";
  productForm.elements.stock.value = product.stock;

  document.getElementById("formTitle").textContent = "Edit Product";
  document.getElementById("saveButton").textContent = "Save Changes";
  document.getElementById("cancelEdit").hidden = false;

  productForm.scrollIntoView({ behavior: "smooth" });
}

function resetProductForm() {
  productForm.reset();
  productForm.elements.id.value = "";
  productForm.elements.stock.value = 20;

  document.getElementById("formTitle").textContent = "Add New Product";
  document.getElementById("saveButton").textContent = "Add Product";
  document.getElementById("cancelEdit").hidden = true;
  formMessage.textContent = "";
}

document.getElementById("cancelEdit")
  .addEventListener("click", resetProductForm);

productForm.addEventListener("submit", async event => {
  event.preventDefault();

  const id = productForm.elements.id.value;

  const data = {
    name: productForm.elements.name.value.trim(),
    price: Number(productForm.elements.price.value),
    category: productForm.elements.category.value.trim(),
    image: productForm.elements.image.value.trim(),
    description: productForm.elements.description.value.trim(),
    stock: Number(productForm.elements.stock.value)
  };

  try {
    if (id) {
      await api("/api/admin/products/" + encodeURIComponent(id), {
        method: "PUT",
        body: JSON.stringify(data)
      });
      formMessage.textContent = "Product updated successfully.";
    } else {
      await api("/api/admin/products", {
        method: "POST",
        body: JSON.stringify(data)
      });
      formMessage.textContent = "Product added successfully.";
    }

    resetProductForm();
    await loadProducts();
  } catch (error) {
    formMessage.textContent = error.message;
  }
});

async function toggleProduct(product) {
  try {
    await api("/api/admin/products/" + product.id + "/availability", {
      method: "PATCH",
      body: JSON.stringify({ active: !product.active })
    });

    await loadProducts();
  } catch (error) {
    alert(error.message);
  }
}

async function deleteProduct(product) {
  if (!confirm("Delete " + product.name + "? This cannot be undone.")) return;

  try {
    await api("/api/admin/products/" + product.id, {
      method: "DELETE"
    });

    await loadProducts();
  } catch (error) {
    alert(error.message);
  }
}

document.getElementById("refreshButton")
  .addEventListener("click", loadProducts);

document.getElementById("logoutButton").addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", { method: "POST" });
    dashboard.hidden = true;
    loginSection.hidden = false;
  } catch (error) {
    alert(error.message);
  }
});

checkLogin();
