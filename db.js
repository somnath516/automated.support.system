const sqlite3 = require("sqlite3").verbose();

/* ===============================
   CONNECT SQLITE DATABASE
================================ */
const db = new sqlite3.Database("./tickets.db", (err) => {
  if (err) {
    console.error("❌ Database connection error:", err.message);
  } else {
    console.log("✅ SQLite Connected");
  }
});

/* ===============================
   INITIALIZE DATABASE
================================ */
db.serialize(() => {

  // Enable foreign keys safely
  db.run("PRAGMA foreign_keys = ON", (err) => {
    if (err) console.error("❌ PRAGMA error:", err.message);
  });

  /* ===============================
     USERS TABLE
  ================================ */
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      password TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin','operator')) NOT NULL
    )
  `, (err) => {
    if (err) console.error("❌ Users table error:", err.message);
    else console.log("✅ Users table ready");
  });

  /* ===============================
     TICKETS TABLE
  ================================ */
  db.run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT CHECK(priority IN ('High','Medium','Low')) NOT NULL,
      category TEXT NOT NULL,
      status TEXT CHECK(status IN ('Assigned','In Progress','Completed')) DEFAULT 'Assigned',
      assignedTo TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error("❌ Tickets table error:", err.message);
    else console.log("✅ Tickets table ready");
  });

  /* ===============================
     SETTINGS TABLE (ADMIN LOGIN)
  ================================ */
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      username TEXT,
      email TEXT,
      password TEXT
    )
  `);

  /* ===============================
     DEFAULT DATA
  ================================ */

  // Admin
  db.get("SELECT id FROM users WHERE id = ?", ["admin"], (err, row) => {
    if (!row) {
      db.run(
        "INSERT INTO users (id, password, role) VALUES (?, ?, ?)",
        ["admin", "admin123", "admin"]
      );
    }
  });

  // Operator
  db.get("SELECT id FROM users WHERE id = ?", ["operator1"], (err, row) => {
    if (!row) {
      db.run(
        "INSERT INTO users (id, password, role) VALUES (?, ?, ?)",
        ["operator1", "operator123", "operator"]
      );
    }
  });

  // Settings (admin login)
  db.run(`
    INSERT OR IGNORE INTO settings (id, username, email, password)
    VALUES (1, 'admin', 'admin@email.com', 'admin123')
  `);

});

/* ===============================
   ERROR HANDLING (IMPORTANT)
================================ */
db.on("error", (err) => {
  console.error("❌ SQLite runtime error:", err.message);
});

module.exports = db;