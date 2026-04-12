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

  db.run("PRAGMA foreign_keys = ON");

  /* USERS TABLE */
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      password TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin','operator')) NOT NULL
    )
  `);

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
  `);

  /* SETTINGS TABLE */
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      username TEXT,
      email TEXT,
      password TEXT
    )
  `);

  /* DEFAULT USERS */

  db.get("SELECT id FROM users WHERE id = ?", ["admin"], (err, row) => {
    if (!row) {
      db.run(
        "INSERT INTO users (id, password, role) VALUES (?, ?, ?)",
        ["admin", "admin123", "admin"]
      );
    }
  });

  db.get("SELECT id FROM users WHERE id = ?", ["operator"], (err, row) => {
    if (!row) {
      db.run(
        "INSERT INTO users (id, password, role) VALUES (?, ?, ?)",
        ["operator", "operator123", "operator"]
      );
    }
  });

  db.run(`
    INSERT OR IGNORE INTO settings (id, username, email, password)
    VALUES (1, 'admin', 'admin@email.com', 'admin123')
  `);

  /* ===============================
     ADVANCED REALISTIC DATA (1200)
  ================================ */
  db.get("SELECT COUNT(*) as count FROM tickets", (err, row) => {

    if (row.count === 0) {
      console.log("📦 Generating advanced realistic tickets...");

      const issues = [
        "Login issue", "System crash", "Network failure",
        "Printer not working", "Slow performance",
        "Access denied", "Database timeout",
        "UI bug", "File upload failed", "Server error"
      ];

      const locations = [
        "HR portal", "Admin dashboard", "Lab 1", "Lab 2",
        "Office PC", "Server room", "Reception system",
        "Finance system", "Student portal", "Main server"
      ];

      const actions = [
        "while logging in", "during file upload",
        "when opening application", "after update",
        "randomly", "during peak hours",
        "after restart", "while processing request"
      ];

      const priorities = ["High", "Medium", "Low"];
      const categories = ["Software", "Hardware", "Network", "Security"];

      const statuses = [
        "Assigned","Assigned","Assigned","Assigned",
        "In Progress","In Progress","Completed"
      ];

      const stmt = db.prepare(`
        INSERT INTO tickets 
        (title, description, priority, category, status, assignedTo, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 1; i <= 1200; i++) {

        const issue = issues[Math.floor(Math.random() * issues.length)];
        const location = locations[Math.floor(Math.random() * locations.length)];
        const action = actions[Math.floor(Math.random() * actions.length)];

        const title = `${issue} in ${location}`;
        const description = `${issue} occurred ${action} at ${location}`;

        const priority = priorities[Math.floor(Math.random() * priorities.length)];
        const category = categories[Math.floor(Math.random() * categories.length)];
        const status = statuses[Math.floor(Math.random() * statuses.length)];

        const timeOffset = Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000);
        const createdAt = new Date(Date.now() - timeOffset)
          .toISOString()
          .replace("T", " ")
          .slice(0, 19);

        stmt.run(
          title,
          description,
          priority,
          category,
          status,
          "operator",
          createdAt
        );
      }

      stmt.finalize();

      console.log("✅ 1200 advanced realistic tickets inserted");
    }
  });

});

module.exports = db;