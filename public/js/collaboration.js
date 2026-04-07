class CollaborationManager {
    constructor(roomId, username) {
        this.roomId = roomId;
        this.username = username;
        this.clientId = this._generateId();
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 50;
        this.reconnectDelay = 1000;
        this.onSceneUpdate = null;
        this.onPointerUpdate = null;
        this.onUserDisconnect = null;
        this.lastSentHash = null;
        this.sentFileIds = {};  // fileIds ya enviados al servidor
        this.knownFileIds = {}; // fileIds que ya tenemos localmente
        this.connect();
    }

    _generateId() {
        return Math.random().toString(36).substring(2, 10);
    }

    connect() {
        var basePath = location.pathname;
        if (!basePath.endsWith("/")) basePath += "/";

        var wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
        var wsUrl = wsProtocol + "//" + location.host + basePath + "?room=" + encodeURIComponent(this.roomId);

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log("WebSocket conectado");
            this.reconnectAttempts = 0;
            this.reconnectDelay = 1000;
            this._updateStatus(true);
        };

        this.ws.onmessage = (event) => {
            try {
                var msg = JSON.parse(event.data);

                if (msg.type === "user-count") {
                    var el = document.getElementById("users-count");
                    el.textContent = msg.count + " conectado" + (msg.count !== 1 ? "s" : "");
                }

                if (msg.type === "scene-init" || msg.type === "scene-update") {
                    if (this.onSceneUpdate && msg.data) {
                        // Filtrar archivos que ya tenemos para no re-procesarlos
                        var newFiles = {};
                        if (msg.data.files) {
                            var fileKeys = Object.keys(msg.data.files);
                            for (var i = 0; i < fileKeys.length; i++) {
                                var fk = fileKeys[i];
                                if (!this.knownFileIds[fk]) {
                                    newFiles[fk] = msg.data.files[fk];
                                    this.knownFileIds[fk] = true;
                                    this.sentFileIds[fk] = true; // no reenviar al servidor
                                }
                            }
                        }
                        this.onSceneUpdate({
                            elements: msg.data.elements,
                            appState: msg.data.appState,
                            files: newFiles
                        });
                    }
                }

                if (msg.type === "pointer-update" && this.onPointerUpdate) {
                    this.onPointerUpdate(msg);
                }

                if (msg.type === "user-left" && this.onUserDisconnect) {
                    this.onUserDisconnect(msg.clientId);
                }
            } catch (e) {
                console.error("Error procesando mensaje WS:", e);
            }
        };

        this.ws.onclose = () => {
            console.log("WebSocket desconectado");
            this._updateStatus(false);
            this._attemptReconnect();
        };

        this.ws.onerror = function (err) {
            console.error("Error WebSocket:", err);
        };
    }

    sendSceneUpdate(elements, appState, files) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        var cleanElements = elements.map(function (el) {
            return Object.assign({}, el);
        });

        // Solo enviar archivos nuevos (delta)
        var newFiles = {};
        var hasNewFiles = false;
        if (files) {
            var fileKeys = Object.keys(files);
            for (var f = 0; f < fileKeys.length; f++) {
                var fk = fileKeys[f];
                if (!this.sentFileIds[fk]) {
                    newFiles[fk] = files[fk];
                    this.sentFileIds[fk] = true;
                    this.knownFileIds[fk] = true;
                    hasNewFiles = true;
                }
            }
        }

        // Hash ligero basado en ids+versions
        var parts = [];
        for (var i = 0; i < cleanElements.length; i++) {
            parts.push(cleanElements[i].id + ":" + (cleanElements[i].version || 0));
        }
        var hash = parts.join(";") + (hasNewFiles ? "|newfiles" : "");
        if (hash === this.lastSentHash && !hasNewFiles) return;
        this.lastSentHash = hash;

        var data = {
            elements: cleanElements,
            appState: {
                viewBackgroundColor: (appState && appState.viewBackgroundColor) || "#ffffff"
            },
            files: newFiles
        };

        this.ws.send(JSON.stringify({
            type: "scene-update",
            data: data
        }));
    }

    sendPointerUpdate(pointer, button) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        this.ws.send(JSON.stringify({
            type: "pointer-update",
            clientId: this.clientId,
            username: this.username,
            pointer: pointer,
            button: button
        }));
    }

    _attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error("Maximo de reconexiones alcanzado");
            return;
        }
        this.reconnectAttempts++;
        var delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
        console.log("Reconectando en " + Math.round(delay / 1000) + "s... (intento " + this.reconnectAttempts + ")");
        setTimeout(() => this.connect(), delay);
    }

    _updateStatus(connected) {
        var indicator = document.getElementById("status-indicator");
        var text = document.getElementById("status-text");
        if (connected) {
            indicator.classList.add("connected");
            text.textContent = "Conectado";
        } else {
            indicator.classList.remove("connected");
            text.textContent = "Reconectando...";
        }
    }
}
