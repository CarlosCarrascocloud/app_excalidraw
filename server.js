const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 50 * 1024 * 1024 });

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

  // Throttle scene-update por cliente para evitar broadcast storms
  ws.lastSceneBroadcast = 0;
  ws.pendingSceneUpdate = null;
  ws.sceneTimer = null;

  ws.on("message", (message) => {
    try {
      const parsed = JSON.parse(message.toString());

      if (parsed.type === "scene-update") {
        // Acumular archivos en vez de reemplazar (los clientes envian solo deltas)
        var roomData = rooms.get(roomId) || { elements: [], appState: {}, files: {} };
        roomData.elements = parsed.data.elements;
        roomData.appState = parsed.data.appState;
        if (parsed.data.files) {
          var newFileKeys = Object.keys(parsed.data.files);
          for (var i = 0; i < newFileKeys.length; i++) {
            roomData.files[newFileKeys[i]] = parsed.data.files[newFileKeys[i]];
          }
        }
        rooms.set(roomId, roomData);

        const now = Date.now();
        const elapsed = now - ws.lastSceneBroadcast;
        const MIN_INTERVAL = 80; // ms minimo entre broadcasts por cliente

        const doBroadcast = () => {
          ws.lastSceneBroadcast = Date.now();
          ws.pendingSceneUpdate = null;
          const msg = JSON.stringify(parsed);
          wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === 1 && client.roomId === roomId) {
              client.send(msg);
            }
          });
        };

        if (elapsed >= MIN_INTERVAL) {
          if (ws.sceneTimer) { clearTimeout(ws.sceneTimer); ws.sceneTimer = null; }
          doBroadcast();
        } else {
          // Guardar y programar el envio
          ws.pendingSceneUpdate = parsed;
          if (!ws.sceneTimer) {
            ws.sceneTimer = setTimeout(() => {
              ws.sceneTimer = null;
              if (ws.pendingSceneUpdate) doBroadcast();
            }, MIN_INTERVAL - elapsed);
          }
        }
      }

      if (parsed.type === "pointer-update") {
        ws.clientId = parsed.clientId;
        const pointerMsg = JSON.stringify(parsed);
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === 1 && client.roomId === roomId) {
            client.send(pointerMsg);
          }
        });
      }
    } catch (e) {
      console.error("Error procesando mensaje:", e);
    }
  });

  ws.on("close", () => {
    console.log(`[-] Cliente desconectado de sala: ${roomId}`);

    if (ws.clientId) {
      const leftMsg = JSON.stringify({ type: "user-left", clientId: ws.clientId });
      wss.clients.forEach((client) => {
        if (client.readyState === 1 && client.roomId === roomId) {
          client.send(leftMsg);
        }
      });
    }

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
