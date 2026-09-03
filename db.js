const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "tickets.db");

console.log("📁 DB Path:", dbPath);

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

  /* OPERATORS TABLE (admin UI manages operators here)
     - uses user identity (id) as name, but you can also treat this as display name
  */
  db.run(`
    CREATE TABLE IF NOT EXISTS operators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin','operator')) NOT NULL,
      UNIQUE(name)
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

  /* Keep the built-in operator directory in sync after users are seeded. */
  db.run("INSERT OR IGNORE INTO operators (name, role) VALUES ('admin', 'admin')");
  db.run("INSERT OR IGNORE INTO operators (name, role) VALUES ('operator', 'operator')");

  db.run(`
    INSERT OR IGNORE INTO settings (id, username, email, password)
    VALUES (1, 'admin', 'admin@email.com', 'admin123')
  `);

  db.run("CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets (assignedTo)");
  db.run("CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status)");
  db.run("CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets (createdAt DESC)");

});

module.exports = db;