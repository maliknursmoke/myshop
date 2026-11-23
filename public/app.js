
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
