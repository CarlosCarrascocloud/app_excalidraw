const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const publicDir = path.join(__dirname, "public");
app.use("/", express.static(publicDir));
app.use("/scalidraw", express.static(publicDir));

// Estado de cada sala
const rooms = new Map();

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomId = url.searchParams.get("room") || "default";

  ws.roomId = roomId;
  ws.isAlive = true;

  console.log(`[+] Cliente conectado a sala: ${roomId}`);

  // Enviar estado actual al nuevo cliente
  if (rooms.has(roomId)) {
    ws.send(JSON.stringify({ type: "scene-init", data: rooms.get(roomId) }));
  }

  broadcastUserCount(roomId);

  ws.on("pong", () => { ws.isAlive = true; });

  ws.on("message", (message) => {
    try {
      const parsed = JSON.parse(message.toString());

      if (parsed.type === "scene-update") {
        rooms.set(roomId, parsed.data);

        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === 1 && client.roomId === roomId) {
            client.send(JSON.stringify(parsed));
          }
        });
      }
    } catch (e) {
      console.error("Error procesando mensaje:", e);
    }
  });

  ws.on("close", () => {
    console.log(`[-] Cliente desconectado de sala: ${roomId}`);
    broadcastUserCount(roomId);
  });
});

function broadcastUserCount(roomId) {
  let count = 0;
  wss.clients.forEach((c) => {
    if (c.roomId === roomId && c.readyState === 1) count++;
  });
  const msg = JSON.stringify({ type: "user-count", count });
  wss.clients.forEach((c) => {
    if (c.roomId === roomId && c.readyState === 1) c.send(msg);
  });
}

// Heartbeat
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on("close", () => clearInterval(interval));

const PORT = process.env.PORT || 3030;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
