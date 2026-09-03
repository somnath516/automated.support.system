const express = require("express");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "development-only-change-me";

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
  process.exit(1);
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(express.static(path.join(__dirname, "client")));
const db = require("./db");

function tokenFrom(req) {
  const authorization = req.headers.authorization;
  if (authorization && authorization.startsWith("Bearer ")) return authorization.slice(7);
  const match = (req.headers.cookie || "").match(/(?:^|;\s*)token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function auth(req, res, next) {
  const token = tokenFrom(req);
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}

function roles(...allowed) {
  return (req, res, next) => allowed.includes(req.user.role)
    ? next()
    : res.status(403).json({ error: "Insufficient permissions" });
}

function createSession(res, user) {
  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: "8h" });
  res.setHeader("Set-Cookie", `token=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`);
}

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "client", "role.html")));

app.post("/api/login", (req, res) => {
  const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!username || !password) return res.status(400).json({ success: false, message: "Username and password are required" });

  db.get("SELECT id, password, role FROM users WHERE id=?", [username], async (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ success: false, message: "Invalid credentials" });
    let valid = false;
    try {
      valid = user.password.startsWith("$2") ? await bcrypt.compare(password, user.password) : password === user.password;
    } catch (compareError) {
      return res.status(500).json({ error: "Unable to verify credentials" });
    }
    if (!valid) return res.status(401).json({ success: false, message: "Invalid credentials" });
    createSession(res, user);
    res.json({ success: true, role: user.role, username: user.id });
  });
});

app.get("/api/me", auth, (req, res) => res.json({ id: req.user.id, role: req.user.role }));
app.post("/api/logout", (req, res) => {
  res.setHeader("Set-Cookie", "token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  res.json({ success: true });
});

app.get("/api/operators", auth, roles("admin"), (req, res) => {
  db.all("SELECT id, name, role FROM operators ORDER BY id DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post("/api/operators", auth, roles("admin"), async (req, res) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const role = typeof req.body.role === "string" ? req.body.role.toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!name || name.length > 100 || password.length < 8 || !["admin", "operator"].includes(role)) {
    return res.status(400).json({ error: "A valid name, role, and password of at least 8 characters are required" });
  }
  const hash = await bcrypt.hash(password, 12);
  db.serialize(() => {
    db.run("BEGIN TRANSACTION");
    db.run("INSERT INTO users (id, password, role) VALUES (?, ?, ?)", [name, hash, role], (userErr) => {
      if (userErr) {
        db.run("ROLLBACK");
        return res.status(userErr.code === "SQLITE_CONSTRAINT" ? 409 : 500).json({ error: userErr.message });
      }
      db.run("INSERT INTO operators (name, role) VALUES (?, ?)", [name, role], function (operatorErr) {
        if (operatorErr) {
          db.run("ROLLBACK");
          return res.status(operatorErr.code === "SQLITE_CONSTRAINT" ? 409 : 500).json({ error: operatorErr.message });
        }
        db.run("COMMIT");
        res.json({ success: true, id: this.lastID });
      });
    });
  });
});

app.delete("/api/operators/:id", auth, roles("admin"), (req, res) => {
  db.get("SELECT name FROM operators WHERE id=?", [req.params.id], (lookupErr, operator) => {
    if (lookupErr) return res.status(500).json({ error: lookupErr.message });
    if (!operator) return res.status(404).json({ error: "Operator not found" });
    if (operator.name === req.user.id) return res.status(400).json({ error: "You cannot delete your own account" });
    db.get("SELECT COUNT(*) AS count FROM tickets WHERE assignedTo=?", [operator.name], (countErr, row) => {
      if (countErr) return res.status(500).json({ error: countErr.message });
      if (row.count > 0) return res.status(409).json({ error: "Reassign this operator's tickets before deleting the account" });
      db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        db.run("DELETE FROM operators WHERE id=?", [req.params.id]);
        db.run("DELETE FROM users WHERE id=?", [operator.name], (deleteErr) => {
          if (deleteErr) {
            db.run("ROLLBACK");
            return res.status(500).json({ error: deleteErr.message });
          }
          db.run("COMMIT");
          res.json({ success: true });
        });
      });
    });
  });
});

app.get("/api/settings", auth, roles("admin"), (req, res) => {
  db.get("SELECT username, email FROM settings WHERE id=1", (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Settings not found" });
    res.json({ success: true, username: row.username, email: row.email });
  });
});

app.put("/api/settings/profile", auth, roles("admin"), (req, res) => {
  const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
  const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
  if (!username || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Valid username and email are required" });
  }
  db.run("UPDATE settings SET username=?, email=? WHERE id=1", [username, email], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: this.changes > 0 });
  });
});

app.put("/api/settings/password", auth, roles("admin"), async (req, res) => {
  const { password, confirmPassword } = req.body;
  if (typeof password !== "string" || password.length < 8 || password !== confirmPassword) {
    return res.status(400).json({ error: "Passwords must match and be at least 8 characters" });
  }
  const hash = await bcrypt.hash(password, 12);
  db.run("UPDATE settings SET password=? WHERE id=1", [hash], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    db.run("UPDATE users SET password=? WHERE id=?", [hash, req.user.id], (userErr) => {
      if (userErr) return res.status(500).json({ error: userErr.message });
      res.json({ success: this.changes > 0 });
    });
  });
});

app.put("/api/settings/password-legacy-disabled", auth, roles("admin"), async (req, res) => {
  const { password, confirmPassword } = req.body;
  if (typeof password !== "string" || password.length < 8 || password !== confirmPassword) {
    return res.status(400).json({ error: "Passwords must match and be at least 8 characters" });
  }
  const hash = await bcrypt.hash(password, 12);
  db.run("UPDATE settings SET password=? WHERE id=1", [hash], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    db.run("UPDATE users SET password=? WHERE id=?", [hash, req.user.id], (userErr) => {
      if (userErr) return res.status(500).json({ error: userErr.message });
      res.json({ success: this.changes > 0 });
    });
  });
});

app.post("/api/tickets", auth, (req, res) => {
  const { title, priority, category, description } = req.body;
  const assignedTo = typeof req.body.assignedTo === "string" ? req.body.assignedTo.trim() : "operator";
  if (typeof title !== "string" || !title.trim() || title.length > 200 ||
      !["High", "Medium", "Low"].includes(priority) || typeof category !== "string" || !category.trim()) {
    return res.status(400).json({ error: "Valid title, priority, and category are required" });
  }
  db.run("INSERT INTO tickets (title, priority, category, description, assignedTo) VALUES (?, ?, ?, ?, ?)",
    [title.trim(), priority, category.trim(), typeof description === "string" ? description.trim() : "", assignedTo],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      const ticket = { id: this.lastID, title: title.trim(), priority, category, description, status: "Assigned", assignedTo };
      io.emit("newTicket", ticket);
      res.json({ success: true, ticketId: this.lastID });
    });
});

app.get("/api/tickets", auth, roles("admin"), (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
  db.all("SELECT * FROM tickets ORDER BY createdAt DESC, id DESC LIMIT ? OFFSET ?", [limit, offset], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });

});

app.get("/api/tickets/summary", auth, roles("admin"), (req, res) => {
  db.get(
    `SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='Assigned' THEN 1 ELSE 0 END) AS assigned,
      SUM(CASE WHEN status='In Progress' THEN 1 ELSE 0 END) AS inProgress,
      SUM(CASE WHEN status='Completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN priority='High' THEN 1 ELSE 0 END) AS high,
      SUM(CASE WHEN priority='Medium' THEN 1 ELSE 0 END) AS medium,
      SUM(CASE WHEN priority='Low' THEN 1 ELSE 0 END) AS low
     FROM tickets`,
    (countErr, counts) => {
      if (countErr) return res.status(500).json({ error: countErr.message });
      db.all("SELECT * FROM tickets ORDER BY createdAt DESC, id DESC LIMIT 5", (ticketErr, recent) => {
        if (ticketErr) return res.status(500).json({ error: ticketErr.message });
        res.json({ counts, recent });
      });
    }
  );
});

app.get("/api/tickets/operator/:name", auth, roles("operator"), (req, res) => {
  if (req.params.name !== req.user.id) return res.status(403).json({ error: "You can only access your own tickets" });
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
  db.all("SELECT * FROM tickets WHERE assignedTo=? ORDER BY createdAt DESC, id DESC LIMIT ? OFFSET ?",
    [req.user.id, limit, offset], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
});

app.get("/api/tickets/operator/:name/summary", auth, roles("operator"), (req, res) => {
  if (req.params.name !== req.user.id) return res.status(403).json({ error: "You can only access your own tickets" });
  db.get(
    `SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='In Progress' THEN 1 ELSE 0 END) AS inProgress,
      SUM(CASE WHEN status='Completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN priority='High' THEN 1 ELSE 0 END) AS high,
      SUM(CASE WHEN priority='Medium' THEN 1 ELSE 0 END) AS medium,
      SUM(CASE WHEN priority='Low' THEN 1 ELSE 0 END) AS low
     FROM tickets WHERE assignedTo=?`,
    [req.user.id],
    (countErr, counts) => {
      if (countErr) return res.status(500).json({ error: countErr.message });
      db.all("SELECT * FROM tickets WHERE assignedTo=? ORDER BY createdAt DESC, id DESC LIMIT 100",
        [req.user.id], (ticketErr, tickets) => {
          if (ticketErr) return res.status(500).json({ error: ticketErr.message });
          res.json({ counts, tickets });
        });
    });
});

app.put("/api/tickets/:id", auth, roles("admin"), (req, res) => {
  const { title, description } = req.body;
  if (typeof title !== "string" || !title.trim() || title.length > 200) return res.status(400).json({ error: "Valid title is required" });
  db.run("UPDATE tickets SET title=?, description=? WHERE id=?", [title.trim(), typeof description === "string" ? description.trim() : "", req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (!this.changes) return res.status(404).json({ error: "Ticket not found" });
    io.emit("ticketStatusUpdated");
    res.json({ success: true });
  });
});

app.put("/api/tickets/:id/status", auth, roles("operator", "admin"), (req, res) => {
  const { status } = req.body;
  if (!["Assigned", "In Progress", "Completed"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  const sql = req.user.role === "operator"
    ? "UPDATE tickets SET status=? WHERE id=? AND assignedTo=?"
    : "UPDATE tickets SET status=? WHERE id=?";
  const params = req.user.role === "operator" ? [status, req.params.id, req.user.id] : [status, req.params.id];
  db.run(sql, params, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (!this.changes) return res.status(404).json({ error: "Ticket not found or not assigned to you" });
    io.emit("ticketStatusUpdated");
    res.json({ success: true });
  });
});

app.delete("/api/tickets/:id", auth, roles("admin"), (req, res) => {
  db.run("DELETE FROM tickets WHERE id=?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (!this.changes) return res.status(404).json({ error: "Ticket not found" });
    io.emit("ticketStatusUpdated");
    res.json({ success: true });
  });
});

app.get("/health", (req, res) => res.json({ status: "ok" }));
io.on("connection", () => {});
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
