const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ✅ Use dynamic PORT for Render, fallback to 3000 locally
const PORT = process.env.PORT || 3000;

/* ================================
   MIDDLEWARE
================================ */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve all HTML/CSS/JS from "client" folder
app.use(express.static(path.join(__dirname, "client")));

// Optional: make role.html the default page
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
   CREATE TABLES IF NOT EXIST
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
      assignedTo TEXT DEFAULT 'operator'
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

  // Default admin
  db.run(`
    INSERT OR IGNORE INTO settings (id, username, email, password)
    VALUES (1, 'admin', 'admin@email.com', 'admin123')
  `);

  // Default operator
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
      } else {
        db.get(
          "SELECT * FROM users WHERE id=? AND password=?",
          [username, password],
          (err, operator) => {
            if (err) return res.status(500).json({ error: err.message });

            if (operator) {
              return res.json({
                success: true,
                role: operator.role,
                username: operator.id
              });
            } else {
              return res.status(401).json({
                success: false,
                message: "Invalid credentials"
              });
            }
          }
        );
      }
    }
  );
});

/* ================================
   TICKETS APIs
================================ */
app.post("/api/tickets", (req, res) => {
  const { title, priority, category, description, assignedTo } = req.body;
  db.run(
    `INSERT INTO tickets (title, priority, category, description, assignedTo)
     VALUES (?, ?, ?, ?, ?)`,
    [title, priority, category, description, assignedTo || "operator"],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      const newTicket = {
        id: this.lastID,
        title,
        priority,
        category,
        description,
        status: "Assigned",
        assignedTo: assignedTo || "operator"
      };

      io.emit("newTicket", newTicket);
      res.json({ success: true, ticketId: this.lastID });
    }
  );
});

app.get("/api/tickets", (req, res) => {
  db.all("SELECT * FROM tickets", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get("/api/tickets/operator/:name", (req, res) => {
  db.all(
    "SELECT * FROM tickets WHERE assignedTo=?",
    [req.params.name],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.put("/api/tickets/:id", (req, res) => {
  const { title, description } = req.body;
  db.run(
    "UPDATE tickets SET title=?, description=? WHERE id=?",
    [title, description, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

app.delete("/api/tickets/:id", (req, res) => {
  db.run("DELETE FROM tickets WHERE id=?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

/* ================================
   SOCKET.IO
================================ */
io.on("connection", (socket) => {
  console.log("User connected");
  socket.on("disconnect", () => console.log("User disconnected"));
});

/* ================================
   START SERVER
================================ */
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});