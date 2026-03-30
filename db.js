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
   CREATE TABLES + DEFAULT DATA
================================ */
db.serialize(() => {

  /* ===============================
     TICKETS TABLE
  ================================ */
  db.run(
    `
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT CHECK(priority IN ('High','Medium','Low')) NOT NULL,
      category TEXT NOT NULL,
      status TEXT DEFAULT 'Assigned',
      assignedTo TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    `,
    (err) => {
      if (err) {
        console.error("❌ Tickets table error:", err.message);
      } else {
        console.log("✅ Tickets table ready");
      }
    }
  );

  /* ===============================
     USERS TABLE
  ================================ */
  db.run(
    `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      password TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin','operator')) NOT NULL
    )
    `,
    (err) => {
      if (err) {
        console.error("❌ Users table error:", err.message);
      } else {
        console.log("✅ Users table ready");
      }
    }
  );

  /* ===============================
     INSERT DEFAULT USERS
  ================================ */

  // Insert Admin if not exists
  db.get("SELECT * FROM users WHERE id = ?", ["admin"], (err, row) => {
    if (err) {
      console.error("❌ Admin check error:", err.message);
      return;
    }

    if (!row) {
      db.run(
        "INSERT INTO users (id, password, role) VALUES (?, ?, ?)",
        ["admin", "admin123", "admin"],
        (err) => {
          if (err) {
            console.error("❌ Admin insert error:", err.message);
          } else {
            console.log("✅ Default admin created");
          }
        }
      );
    } else {
      console.log("ℹ️ Admin already exists");
    }
  });

  // Insert Operator if not exists
  db.get("SELECT * FROM users WHERE id = ?", ["operator"], (err, row) => {
    if (err) {
      console.error("❌ Operator check error:", err.message);
      return;
    }

    if (!row) {
      db.run(
        "INSERT INTO users (id, password, role) VALUES (?, ?, ?)",
        ["operator", "operator123", "operator"],
        (err) => {
          if (err) {
            console.error("❌ Operator insert error:", err.message);
          } else {
            console.log("✅ Default operator created");
          }
        }
      );
    } else {
      console.log("ℹ️ Operator already exists");
    }
  });

});

/* ===============================
   EXPORT DATABASE
================================ */
module.exports = db;