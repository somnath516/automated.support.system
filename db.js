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

  // Enable foreign keys
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
     SETTINGS TABLE
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
     DEFAULT USERS
  ================================ */

  // Admin
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

  /* ===============================
     ADMIN SETTINGS
  ================================ */
  db.run(`
    INSERT OR IGNORE INTO settings (id, username, email, password)
    VALUES (1, 'admin', 'admin@email.com', 'admin123')
  `);

  /* ===============================
     REALISTIC DATA GENERATION (1200)
  ================================ */
  db.get("SELECT COUNT(*) as count FROM tickets", (err, row) => {
    if (err) return console.error("❌ Count error:", err.message);

    if (row.count === 0) {
      console.log("📦 Generating realistic tickets...");

      const titles = [
        "Login issue", "System crash", "Network failure",
        "Printer not working", "Slow performance",
        "Software install error", "Access denied",
        "Database timeout", "UI bug", "File upload failed"
      ];

      const descriptions = [
        "User unable to complete task",
        "Unexpected system behavior",
        "Connection lost intermittently",
        "Device not responding",
        "Performance degradation noticed",
        "Application not opening",
        "Permission issue",
        "Server response delayed",
        "Visual glitch in UI",
        "Operation failed during execution"
      ];

      const priorities = ["High", "Medium", "Low"];
      const categories = ["Software", "Hardware", "Network", "Security"];

      const statuses = [
        "Assigned","Assigned","Assigned","Assigned","Assigned",
        "In Progress","In Progress","In Progress",
        "Completed","Completed"
      ];

      const stmt = db.prepare(`
        INSERT INTO tickets 
        (title, description, priority, category, status, assignedTo, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 1; i <= 1200; i++) {

        const title = titles[Math.floor(Math.random() * titles.length)];
        const description = descriptions[Math.floor(Math.random() * descriptions.length)];
        const priority = priorities[Math.floor(Math.random() * priorities.length)];
        const category = categories[Math.floor(Math.random() * categories.length)];
        const status = statuses[Math.floor(Math.random() * statuses.length)];

        const daysAgo = Math.floor(Math.random() * 30);
        const createdAt = new Date(Date.now() - daysAgo * 86400000)
          .toISOString()
          .replace("T", " ")
          .slice(0, 19);

        stmt.run(
          `${title} #${i}`,
          description,
          priority,
          category,
          status,
          "operator",
          createdAt
        );
      }

      stmt.finalize();

      console.log("✅ 1200 realistic tickets inserted");
    }
  });

});

module.exports = db;