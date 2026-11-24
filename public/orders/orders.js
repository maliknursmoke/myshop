const orderList = document.getElementById("orderList");
const summary = document.getElementById("summary");

const statuses = [
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

function element(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}

async function checkAdmin() {
  try {
    const result = await api("/api/admin/me");

    if (!result.authenticated) {
      orderList.textContent = "Please log in to the admin dashboard first.";
      const link = element("a", "Go to Admin Login");
      link.href = "/admin";
      orderList.appendChild(link);
      return false;
    }

    return true;
  } catch (error) {
    orderList.textContent = error.message;
    return false;
  }
}

async function loadOrders() {
  orderList.textContent = "Loading orders...";
  summary.textContent = "";

  if (!(await checkAdmin())) return;

  try {
    const orders = await api("/api/admin/orders");

    const pending = orders.filter(o => o.status === "Pending").length;
    const confirmed = orders.filter(o => o.status === "Confirmed").length;
    const shipped = orders.filter(o => o.status === "Shipped").length;
    const delivered = orders.filter(o => o.status === "Delivered").length;

    summary.textContent =
      "Total: " + orders.length +
      " | Pending: " + pending +
      " | Confirmed: " + confirmed +
      " | Shipped: " + shipped +
      " | Delivered: " + delivered;

    orderList.replaceChildren();

    if (!orders.length) {
      orderList.textContent = "No customer orders received yet.";
      return;
    }

    orders.forEach(order => {
      const card = element("article", undefined, "order-card");
      const customer = order.customer || {};

      card.appendChild(element(
        "h2",
        "Order #" + String(order.id).slice(0, 8)
      ));

      card.appendChild(element(
        "p",
        "Date: " + (order.createdAt
          ? new Date(order.createdAt).toLocaleString()
          : "Unknown")
      ));

      card.appendChild(element("h3", "Customer Information"));
      card.appendChild(element("p", "Name: " + (customer.name || "N/A")));
      card.appendChild(element("p", "Phone: " + (customer.phone || "N/A")));
      card.appendChild(element("p", "Address: " + (customer.address || "N/A")));

      card.appendChild(element("h3", "Products"));

      const list = element("ul");

      (Array.isArray(order.items) ? order.items : []).forEach(item => {
        list.appendChild(element(
          "li",
          (item.name || "Product") +
          " × " + Number(item.quantity || 0) +
          " — " +
          (Number(item.price || 0) * Number(item.quantity || 0))
            .toLocaleString() + " ETB"
        ));
      });

      card.appendChild(list);

      card.appendChild(element(
        "p",
        "Total: " + Number(order.total || 0).toLocaleString() + " ETB",
        "total"
      ));

      card.appendChild(element(
        "p",
        "Payment: " + (order.paymentMethod || "N/A")
      ));

      const label = element("label", "Update order status");
      const select = document.createElement("select");

      statuses.forEach(status => {
        const option = element("option", status);
        option.value = status;
        option.selected = status === order.status;
        select.appendChild(option);
      });

      label.appendChild(select);
      card.appendChild(label);

      const button = element("button", "Save Status");

      button.addEventListener("click", async () => {
        button.disabled = true;
        button.textContent = "Saving...";

        try {
          await api(
            "/api/admin/orders/" + encodeURIComponent(order.id),
            {
              method: "PATCH",
              body: JSON.stringify({ status: select.value })
            }
          );

          await loadOrders();
        } catch (error) {
          alert(error.message);
          button.disabled = false;
          button.textContent = "Save Status";
        }
      });

      card.appendChild(button);
      orderList.appendChild(card);
    });

  } catch (error) {
    orderList.textContent = "Error loading orders: " + error.message;
  }
}

document.getElementById("refreshButton")
  .addEventListener("click", loadOrders);

loadOrders();
