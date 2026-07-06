const express = require("express");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

/* ================================
   GLOBAL ERROR HANDLING
================================ */
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Rejection:", err);
});

/* ================================
   MIDDLEWARE
================================ */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "client")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "client/role.html"));
});

/* ================================
   DATABASE
================================ */
const db = require("./db");

/* ================================
   LOGIN API
================================ */
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  console.log("🔐 Login attempt:", username);

  // Admin check
  db.get(
    "SELECT * FROM settings WHERE username=? AND password=?",
    [username, password],
    (err, admin) => {
      if (err) return res.status(500).json({ error: err.message });

      if (admin) {
        return res.json({
          success: true,
          role: "admin",
          username: admin.username
        });
      }

      // Operator check
      db.get(
        "SELECT * FROM users WHERE id=? AND password=?",
        [username, password],
        (err, operator) => {
          if (err) return res.status(500).json({ error: err.message });

          if (operator) {
            return res.json({
              success: true,
              role: "operator",
              username: operator.id
            });
          }

          return res.status(401).json({
            success: false,
            message: "Invalid credentials"
          });
        }
      );
    }
  );
});

/* ================================
   OPERATORS APIs
================================ */

// GET all operators
app.get("/api/operators", (req, res) => {
  db.all("SELECT id, name, role FROM operators ORDER BY id DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ADD operator
app.post("/api/operators", (req, res) => {
  const { name, role } = req.body;
  if (!name || !role) return res.status(400).json({ error: "name and role are required" });

  db.run(
    "INSERT INTO operators (name, role) VALUES (?, ?)",
    [name, role],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    }
  );
});

// DELETE operator
app.delete("/api/operators/:id", (req, res) => {
  db.run("DELETE FROM operators WHERE id=?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: this.changes > 0 });
  });
});

/* ================================
   SETTINGS APIs
================================ */

// GET SETTINGS (admin only in this simple app)
app.get("/api/settings", (req, res) => {
  db.get(
    "SELECT username, email, password FROM settings WHERE id=1",
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: "Settings not found" });
      res.json({
        username: row.username,
        email: row.email,
        // do not expose password to frontend
        success: true
      });
    }
  );
});

// UPDATE PROFILE
app.put("/api/settings/profile", (req, res) => {
  const { username, email } = req.body;

  if (!username || !email) {
    return res.status(400).json({ error: "username and email are required" });
  }

  db.run(
    "UPDATE settings SET username=?, email=? WHERE id=1",
    [username, email],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: this.changes > 0 });
    }
  );
});

// UPDATE PASSWORD
app.put("/api/settings/password", (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: "password is required" });
  }

  db.run(
    "UPDATE settings SET password=? WHERE id=1",
    [password],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: this.changes > 0 });
    }
  );
});

/* ================================
   TICKETS APIs
================================ */

// CREATE TICKET
app.post("/api/tickets", (req, res) => {
  const { title, priority, category, description, assignedTo } = req.body;

  // ✅ FIXED: operator instead of operator1
  const assignedUser = assignedTo || "operator";

  db.run(
    `INSERT INTO tickets (title, priority, category, description, assignedTo)
     VALUES (?, ?, ?, ?, ?)`,
    [title, priority, category, description, assignedUser],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      const newTicket = {
        id: this.lastID,
        title,
        priority,
        category,
        description,
        status: "Assigned",
        assignedTo: assignedUser
      };

      console.log("🆕 Ticket Created:", newTicket);

      // 🔥 Real-time trigger
      io.emit("newTicket", newTicket);

      res.json({ success: true, ticketId: this.lastID });
    }
  );
});

// GET ALL TICKETS (Admin)
app.get("/api/tickets", (req, res) => {
  db.all("SELECT * FROM tickets ORDER BY createdAt DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET OPERATOR TICKETS
app.get("/api/tickets/operator/:name", (req, res) => {
  const operatorName = req.params.name;

  console.log("📥 Fetching tickets for:", operatorName);

  db.all(
    "SELECT * FROM tickets WHERE assignedTo=?",
    [operatorName],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      console.log("📊 Tickets found:", rows.length);
      res.json(rows);
    }
  );
});

// UPDATE TICKET
app.put("/api/tickets/:id", (req, res) => {
  const { title, description } = req.body;

  db.run(
    "UPDATE tickets SET title=?, description=? WHERE id=?",
    [title, description, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });

      console.log("✏️ Ticket updated:", req.params.id);

      io.emit("ticketStatusUpdated");
      res.json({ success: true });
    }
  );
});

// UPDATE STATUS
app.put("/api/tickets/:id/status", (req, res) => {
  const { status } = req.body;

  db.run(
    "UPDATE tickets SET status=? WHERE id=?",
    [status, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      console.log(`🔄 Ticket ${req.params.id} → ${status}`);

      io.emit("ticketStatusUpdated");
      res.json({ success: true });
    }
  );
});

// DELETE TICKET
app.delete("/api/tickets/:id", (req, res) => {
  db.run("DELETE FROM tickets WHERE id=?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });

    console.log("🗑️ Ticket deleted:", req.params.id);

    io.emit("ticketStatusUpdated");
    res.json({ success: true });
  });
});

/* ================================
   SOCKET.IO
================================ */
io.on("connection", (socket) => {
  console.log("🔌 User connected");

  socket.on("disconnect", () => {
    console.log("❌ User disconnected");
  });
});

/* ================================
   START SERVER
================================ */
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});