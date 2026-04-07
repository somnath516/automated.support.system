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
   ENABLE FOREIGN KEYS (GOOD PRACTICE)
================================ */
db.run("PRAGMA foreign_keys = ON");

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
      status TEXT CHECK(status IN ('Assigned','In Progress','Completed')) DEFAULT 'Assigned',
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

  // Admin
  db.get("SELECT id FROM users WHERE id = ?", ["admin"], (err, row) => {
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
    }
  });

  // Operator
  db.get("SELECT id FROM users WHERE id = ?", ["operator"], (err, row) => {
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
    }
  });

});

/* ===============================
   HELPER FUNCTIONS (IMPORTANT)
   👉 Use these instead of raw queries
================================ */

// Update ticket status (THIS is what you were missing logically)
db.updateTicketStatus = (id, status, callback) => {
  db.run(
    "UPDATE tickets SET status = ? WHERE id = ?",
    [status, id],
    function (err) {
      if (err) {
        console.error("❌ Update error:", err.message);
        callback(err);
      } else {
        console.log(`✅ Ticket ${id} updated to ${status}`);
        callback(null, this.changes);
      }
    }
  );
};

// Get all tickets
db.getAllTickets = (callback) => {
  db.all("SELECT * FROM tickets ORDER BY createdAt DESC", callback);
};

// Create ticket
db.createTicket = (ticket, callback) => {
  const { title, description, priority, category, assignedTo } = ticket;

  db.run(
    `
    INSERT INTO tickets (title, description, priority, category, assignedTo)
    VALUES (?, ?, ?, ?, ?)
    `,
    [title, description, priority, category, assignedTo],
    function (err) {
      if (err) {
        console.error("❌ Insert error:", err.message);
        callback(err);
      } else {
        console.log("✅ Ticket created with ID:", this.lastID);
        callback(null, this.lastID);
      }
    }
  );
};

/* ===============================
   EXPORT DATABASE
================================ */
module.exports = db;