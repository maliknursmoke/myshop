const loginSection = document.getElementById("loginSection");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("loginForm");
const productForm = document.getElementById("productForm");
const productList = document.getElementById("productList");

const loginMessage = document.getElementById("loginMessage");
const formMessage = document.getElementById("formMessage");

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

      const name = document.createElement("h3");
      name.textContent = product.name;

      const category = document.createElement("p");
      category.textContent = "Category: " + product.category;

      const price = document.createElement("p");
      price.textContent = Number(product.price).toLocaleString() + " ETB";

      const stock = document.createElement("p");
      stock.textContent = "Stock: " + product.stock;

      const status = document.createElement("p");
      status.textContent = product.active ? "Available" : "Hidden";
      status.className = product.active ? "available" : "hidden-status";

      const edit = document.createElement("button");
      edit.textContent = "Edit";
      edit.addEventListener("click", () => editProduct(product));

      const toggle = document.createElement("button");
      toggle.className = "secondary";
      toggle.textContent = product.active ? "Hide" : "Show";
      toggle.addEventListener("click", () => toggleProduct(product));

      const remove = document.createElement("button");
      remove.className = "danger";
      remove.textContent = "Delete";
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

document.getElementById("cancelEdit").addEventListener("click", resetProductForm);

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

document.getElementById("refreshButton").addEventListener("click", loadProducts);

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
