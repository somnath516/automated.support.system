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
   DATABASE (ONLY ONE CONNECTION)
================================ */
const db = require("./db");

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
   TICKETS APIs
================================ */

// CREATE
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

      io.emit("newTicket", newTicket);
      res.json({ success: true, ticketId: this.lastID });
    }
  );
});

// GET ALL
app.get("/api/tickets", (req, res) => {
  db.all("SELECT * FROM tickets ORDER BY createdAt DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET OPERATOR
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

// UPDATE TICKET
app.put("/api/tickets/:id", (req, res) => {
  const { title, description } = req.body;

  db.run(
    "UPDATE tickets SET title=?, description=? WHERE id=?",
    [title, description, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });

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

      io.emit("ticketStatusUpdated");
      res.json({ success: true });
    }
  );
});

// DELETE
app.delete("/api/tickets/:id", (req, res) => {
  db.run("DELETE FROM tickets WHERE id=?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });

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