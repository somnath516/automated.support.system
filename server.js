const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

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
const db = new sqlite3.Database("tickets.db", (err) => {
  if (err) {
    console.error("❌ DB connection error:", err.message);
  } else {
    console.log("✅ SQLite Connected");
  }
});

/* ================================
   CREATE TABLES
================================ */
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      priority TEXT,
      category TEXT,
      description TEXT,
      status TEXT DEFAULT 'Assigned',
      assignedTo TEXT DEFAULT 'operator1'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      username TEXT,
      email TEXT,
      password TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      password TEXT NOT NULL,
      role TEXT CHECK(role IN ('operator')) NOT NULL
    )
  `);

  db.run(`
    INSERT OR IGNORE INTO settings (id, username, email, password)
    VALUES (1, 'admin', 'admin@email.com', 'admin123')
  `);

  db.run(`
    INSERT OR IGNORE INTO users (id, password, role)
    VALUES ('operator1', 'operator123', 'operator')
  `);
});

/* ================================
   LOGIN API
================================ */
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

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

      db.get(
        "SELECT * FROM users WHERE id=? AND password=?",
        [username, password],
        (err, operator) => {
          if (err) return res.status(500).json({ error: err.message });

          if (operator) {
            return res.json({
              success: true,
              role: "operator",
              username: operator.id // IMPORTANT: must match assignedTo
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
   TICKETS APIs
================================ */

// ✅ CREATE TICKET
app.post("/api/tickets", (req, res) => {
  const { title, priority, category, description, assignedTo } = req.body;

  const assignedUser = assignedTo || "operator1";

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

      io.emit("newTicket", newTicket); // 🔥 notify all clients
      res.json({ success: true, ticketId: this.lastID });
    }
  );
});

// ✅ GET ALL TICKETS (Admin)
app.get("/api/tickets", (req, res) => {
  db.all("SELECT * FROM tickets", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ✅ GET OPERATOR TICKETS
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

// ✅ EDIT TICKET
app.put("/api/tickets/:id", (req, res) => {
  const { title, description } = req.body;

  db.run(
    "UPDATE tickets SET title=?, description=? WHERE id=?",
    [title, description, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });

      io.emit("ticketStatusUpdated"); // 🔥 notify UI
      res.json({ success: true });
    }
  );
});

// ✅ UPDATE STATUS (CRITICAL)
app.put("/api/tickets/:id/status", (req, res) => {
  const { status } = req.body;
  const id = req.params.id;

  db.run(
    "UPDATE tickets SET status=? WHERE id=?",
    [status, id],
    function (err) {
      if (err) {
        console.error("❌ Status update error:", err.message);
        return res.status(500).json({ error: err.message });
      }

      console.log(`🔄 Ticket ${id} updated to ${status}`);

      io.emit("ticketStatusUpdated"); // 🔥 REAL-TIME UPDATE

      res.json({ success: true });
    }
  );
});

// ✅ DELETE TICKET
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