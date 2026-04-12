const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");

const dbPath = path.resolve("./tickets.db");

console.log("📁 DB Path:", dbPath);

/* ===============================
   AUTO FIX CORRUPTED DB
================================ */
if (fs.existsSync(dbPath)) {
  try {
    const stats = fs.statSync(dbPath);

    // If file is too small → likely corrupted
    if (stats.size < 1000) {
      console.log("⚠️ Corrupted DB detected. Deleting...");
      fs.unlinkSync(dbPath);
    }
  } catch (err) {
    console.log("⚠️ DB check failed. Resetting...");
    fs.unlinkSync(dbPath);
  }
}

/* ===============================
   CONNECT DATABASE
================================ */
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("❌ Database connection error:", err.message);
  } else {
    console.log("✅ SQLite Connected");
  }
});

/* ===============================
   GLOBAL ERROR HANDLER
================================ */
db.on("error", (err) => {
  console.error("❌ SQLite runtime error:", err.message);
});

/* ===============================
   INITIALIZE DATABASE
================================ */
db.serialize(() => {

  // Foreign keys
  db.run("PRAGMA foreign_keys = ON", (err) => {
    if (err) console.error("❌ PRAGMA error:", err.message);
  });

  /* USERS TABLE */
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

  /* TICKETS TABLE */
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

  /* SETTINGS TABLE */
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      username TEXT,
      email TEXT,
      password TEXT
    )
  `);

  /* DEFAULT DATA */

  // Admin user
  db.get("SELECT id FROM users WHERE id = ?", ["admin"], (err, row) => {
    if (err) return console.error("❌ Admin check error:", err.message);

    if (!row) {
      db.run(
        "INSERT INTO users (id, password, role) VALUES (?, ?, ?)",
        ["admin", "admin123", "admin"],
        (err) => {
          if (err) console.error("❌ Admin insert error:", err.message);
          else console.log("✅ Default admin created");
        }
      );
    }
  });

  // Operator
  db.get("SELECT id FROM users WHERE id = ?", ["operator"], (err, row) => {
    if (err) return console.error("❌ Operator check error:", err.message);

    if (!row) {
      db.run(
        "INSERT INTO users (id, password, role) VALUES (?, ?, ?)",
        ["operator", "operator123", "operator"],
        (err) => {
          if (err) console.error("❌ Operator insert error:", err.message);
          else console.log("✅ Default operator created");
        }
      );
    }
  });

  // Admin settings
  db.run(`
    INSERT OR IGNORE INTO settings (id, username, email, password)
    VALUES (1, 'admin', 'admin@email.com', 'admin123')
  `);

});

module.exports = db;