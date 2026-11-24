
let products = [];
let cart = JSON.parse(localStorage.getItem("myshop-cart") || "[]");

const grid = document.getElementById("productGrid");
const cartItems = document.getElementById("cartItems");
const cartCount = document.getElementById("cartCount");
const cartTotal = document.getElementById("cartTotal");

function saveCart() {
  localStorage.setItem("myshop-cart", JSON.stringify(cart));
}

async function loadProducts() {
  try {

// ---------------- CUSTOMER ACCOUNT FRONTEND ----------------

const customerNav = document.getElementById("customerNav");
const customerWelcome = document.getElementById("customerWelcome");
const customerAuth = document.getElementById("customerAuth");
const customerAccount = document.getElementById("customerAccount");
const authMessage = document.getElementById("authMessage");
function showCustomer(customer) {
  customerNav.hidden = true;
  customerWelcome.hidden = false;

  const name = customer.fullName || customer.full_name;

  document.getElementById("welcomeName").textContent =
    "Hello, " + name;

  document.querySelector('#checkoutForm [name="name"]').value = name;
  document.querySelector('#checkoutForm [name="phone"]').value =
    customer.phone;
}
function openAuth(mode) {
  customerAccount.hidden = true;
  customerAuth.hidden = false;

  document.getElementById("loginPanel").hidden = mode !== "login";
  document.getElementById("registerPanel").hidden = mode !== "register";

  authMessage.textContent = "";
  customerAuth.scrollIntoView({ behavior: "smooth" });
}

document.getElementById("loginOpen").addEventListener("click", () => {
  openAuth("login");
});

document.getElementById("registerOpen").addEventListener("click", () => {
  openAuth("register");
});

document.getElementById("closeAuth").addEventListener("click", () => {
  customerAuth.hidden = true;
});

async function loadCustomerSession() {
  try {
    const response = await fetch("/api/customer/me");

    if (!response.ok) {
      customerNav.hidden = false;
      customerWelcome.hidden = true;
      return;
    }

    const data = await response.json();
    const customer = data.customer;

   showCustomer(customer);

  } catch (error) {
    console.error("Customer session error:", error);
  }
}

// Customer registration
document.getElementById("registerForm").addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.target;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  authMessage.textContent = "Creating your account...";

  try {
    const response = await fetch("/api/customer/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: form.elements.fullName.value.trim(),
        email: form.elements.email.value.trim(),
        phone: form.elements.phone.value.trim(),
        password: form.elements.password.value
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Registration failed.");
    }

    authMessage.textContent = "Account created successfully!";
form.reset();
customerAuth.hidden = true;
showCustomer(result.customer);

  } catch (error) {
    authMessage.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

// Customer login
document.getElementById("loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.target;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  authMessage.textContent = "Logging in...";

  try {
    const response = await fetch("/api/customer/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.elements.email.value.trim(),
        password: form.elements.password.value
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Login failed.");
    }

   form.reset();
customerAuth.hidden = true;
showCustomer(result.customer);

  } catch (error) {
    authMessage.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

// Open account and order history
document.getElementById("accountOpen").addEventListener("click", async () => {
  customerAccount.hidden = false;
  customerAuth.hidden = true;

  const details = document.getElementById("accountDetails");
  const ordersBox = document.getElementById("customerOrders");

  details.textContent = "Loading account...";
  ordersBox.textContent = "Loading orders...";

  customerAccount.scrollIntoView({ behavior: "smooth" });

  try {
    const accountResponse = await fetch("/api/customer/me");

    if (!accountResponse.ok) {
      throw new Error("Please log in again.");
    }

    const accountData = await accountResponse.json();
    const customer = accountData.customer;

    details.textContent =
      "Name: " + customer.fullName +
      " | Email: " + customer.email +
      " | Phone: " + customer.phone;

    const ordersResponse = await fetch("/api/customer/orders");

    if (!ordersResponse.ok) {
      throw new Error("Unable to load orders.");
    }

    const ordersData = await ordersResponse.json();
    ordersBox.innerHTML = "";

    if (!ordersData.orders.length) {
      ordersBox.textContent = "You haven't placed any orders yet.";
      return;
    }

    ordersData.orders.forEach(order => {
      const card = document.createElement("div");
      card.className = "order-card";

      const heading = document.createElement("h4");
      heading.textContent = "Order #" + order.id;

      const items = document.createElement("p");
      items.textContent = order.items.map(item =>
        item.name + " x " + item.quantity
      ).join(", ");

      const total = document.createElement("p");
      total.textContent = "Total: " + Number(order.total).toLocaleString() + " ETB";

      const status = document.createElement("p");
      status.className = "order-status";
      status.textContent = "Status: " + order.status;

      const payment = document.createElement("p");
      payment.textContent = "Payment: " + order.paymentMethod;

      const date = document.createElement("p");
      date.textContent = "Date: " + new Date(order.createdAt).toLocaleString();

      card.append(heading, items, total, status, payment, date);
      ordersBox.appendChild(card);
    });

  } catch (error) {
    details.textContent = error.message;
    ordersBox.textContent = "";
  }
});

document.getElementById("closeAccount").addEventListener("click", () => {
  customerAccount.hidden = true;
});

// Customer logout
document.getElementById("logoutButton").addEventListener("click", async () => {
  try {
    const response = await fetch("/api/customer/logout", {
      method: "POST"
    });

    if (!response.ok) {
      throw new Error("Logout failed.");
    }

    customerAccount.hidden = true;
    customerAuth.hidden = true;
    await loadCustomerSession();

    alert("You have logged out.");

  } catch (error) {
    alert(error.message);
  }
});

// Check whether a customer is already logged in
loadCustomerSession();
  const response = await fetch("/api/products");
    if (!response.ok) throw new Error("Could not load products");

    products = await response.json();
    displayProducts(products);
    displayCart();
  } catch (error) {
    grid.textContent = "Unable to load products. Please refresh.";
  }
}

function displayProducts(list) {
  grid.innerHTML = "";

  if (list.length === 0) {
    grid.textContent = "No products found.";
    return;
  }

  list.forEach(product => {
    const card = document.createElement("article");
    card.className = "product-card";

    const img = document.createElement("img");
    img.src = product.image;
    img.alt = product.name;
    img.loading = "lazy";

    const info = document.createElement("div");
    info.className = "product-info";

    const name = document.createElement("h3");
    name.textContent = product.name;

    const description = document.createElement("p");
    description.textContent = product.description;

    const price = document.createElement("p");
    price.className = "price";
    price.textContent = product.price.toLocaleString() + " ETB";

    const button = document.createElement("button");
    button.textContent = "Add to Cart";
    button.addEventListener("click", () => addToCart(product.id));

    info.append(name, description, price, button);
    card.append(img, info);
    grid.appendChild(card);
  });
}

function addToCart(id) {
  const item = cart.find(p => p.id === id);

  if (item) {
    if (item.quantity >= 20) {
      alert("Maximum quantity reached.");
      return;
    }
    item.quantity++;
  } else {
    cart.push({ id, quantity: 1 });
  }

  saveCart();
  displayCart();
}

function changeQuantity(id, amount) {
  const item = cart.find(p => p.id === id);
  if (!item) return;

  item.quantity += amount;

  if (item.quantity <= 0) {
    cart = cart.filter(p => p.id !== id);
  }

  saveCart();
  displayCart();
}

function displayCart() {
  cartItems.innerHTML = "";

  let total = 0;
  let count = 0;

  cart.forEach(item => {
    const product = products.find(p => p.id === item.id);
    if (!product) return;

    total += product.price * item.quantity;
    count += item.quantity;

    const row = document.createElement("div");
    row.className = "cart-row";

    const details = document.createElement("span");
    details.textContent =
      product.name + " × " + item.quantity;

    const price = document.createElement("span");
    price.textContent =
      (product.price * item.quantity).toLocaleString() + " ETB";

    const minus = document.createElement("button");
    minus.textContent = "−";
    minus.addEventListener("click", () =>
      changeQuantity(item.id, -1)
    );

    const plus = document.createElement("button");
    plus.textContent = "+";
    plus.addEventListener("click", () =>
      changeQuantity(item.id, 1)
    );

    row.append(details, price, minus, plus);
    cartItems.appendChild(row);
  });

  if (count === 0) {
    cartItems.textContent = "Your cart is empty.";
  }

  cartCount.textContent = count;
  cartTotal.textContent = total.toLocaleString();
}

document.getElementById("search").addEventListener("input", event => {
  const query = event.target.value.toLowerCase();

  displayProducts(products.filter(product =>
    product.name.toLowerCase().includes(query) ||
    product.category.toLowerCase().includes(query)
  ));
});

document.getElementById("cartButton").addEventListener("click", () => {
  document.getElementById("cart").scrollIntoView();
});

document.getElementById("checkoutButton").addEventListener("click", () => {
  if (cart.length === 0) {
    alert("Your shopping cart is empty.");
    return;
  }

  document.getElementById("checkout").scrollIntoView();
});

document.getElementById("checkoutForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (cart.length === 0) {
    alert("Your cart is empty.");
    return;
  }

  const form = event.target;
  const message = document.getElementById("orderMessage");
  const submitButton = form.querySelector("button[type=submit]");

  const data = {
    customer: {
      name: form.elements.name.value.trim(),
      phone: form.elements.phone.value.trim(),
      address: form.elements.address.value.trim()
    },
    items: cart,
    paymentMethod: form.elements.paymentMethod.value
  };

  submitButton.disabled = true;
  message.textContent = "Submitting your order...";

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Order failed.");
    }

    message.textContent =
      "Order successful! Order ID: " + result.orderId +
      " | Total: " + result.total.toLocaleString() + " ETB";

    cart = [];
    saveCart();
    displayCart();
    form.reset();

  } catch (error) {
    message.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

loadProducts();
