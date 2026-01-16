const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const Database = require("better-sqlite3");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

/* =======================
   DATABASE
======================= */
const db = new Database("data.db");

db.prepare(`
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT,
  tag INTEGER,
  monat INTEGER,
  target INTEGER,
  targetReached INTEGER
)
`).run();

/* =======================
   IN-MEMORY CACHE
======================= */
const cache = new Map();

function loadCache() {
  const rows = db.prepare("SELECT * FROM employees").all();
  cache.clear();
  rows.forEach(r => cache.set(r.id, r));
}
loadCache();

/* =======================
   SOCKET.IO
======================= */
io.on("connection", socket => {
  console.log("User connected");

  // Инициализация
  socket.emit("init", [...cache.values()]);

  // Обновление сотрудников
  socket.on("update", newData => {
    const targetEvents = [];

    newData.forEach(emp => {
      const old = cache.get(emp.id);
      emp.targetReached = old?.targetReached || 0;

      const percent = emp.target>0? Math.floor(emp.monat/emp.target*100):0;

      if(percent>=100 && !emp.targetReached){
        emp.targetReached=1;
        targetEvents.push({id:emp.id, name:emp.name||"Employee"});
      }

      cache.set(emp.id, emp);

      db.prepare(`
        INSERT INTO employees VALUES (?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name,
          tag=excluded.tag,
          monat=excluded.monat,
          target=excluded.target,
          targetReached=excluded.targetReached
      `).run(emp.id, emp.name, emp.tag, emp.monat, emp.target, emp.targetReached);
    });

    io.emit("update", [...cache.values()]);
    targetEvents.forEach(e=>io.emit("target", e));
  });

  // Бонус
  socket.on("bonus", data=>{
    io.emit("bonus", data);
  });

  // Сброс TARGET
  socket.on("resetTarget", ()=>{
    cache.forEach(emp=>emp.targetReached=0);
    db.prepare("UPDATE employees SET targetReached=0").run();
    io.emit("update", [...cache.values()]);
  });

  // Удаление сотрудника
  socket.on("deleteEmployee", id=>{
    cache.delete(id);
    db.prepare("DELETE FROM employees WHERE id=?").run(id);
    io.emit("deleteEmployee", id);
  });

  socket.on("disconnect", ()=>{
    console.log("User disconnected");
  });
});

server.listen(3000,"0.0.0.0", ()=>console.log("Server running on port 3000"));
