(function () {
    var defaultNames = [
        "Alpaca", "Vicuna", "Condor", "Puma", "Llama",
        "Otorongo", "Colibrí", "Zorro", "Taruca", "Guanaco"
    ];

    function getDefaultName() {
        var name = defaultNames[Math.floor(Math.random() * defaultNames.length)];
        var num = Math.floor(Math.random() * 99) + 1;
        return name + " " + num;
    }

    function showNameModal(callback) {
        var modal = document.getElementById("name-modal");
        var input = document.getElementById("name-input");
        var confirmBtn = document.getElementById("name-confirm");
        var cancelBtn = document.getElementById("name-cancel");

        function confirm() {
            var name = input.value.trim();
            modal.classList.add("hidden");
            callback(name || getDefaultName());
        }

        confirmBtn.addEventListener("click", confirm);
        input.addEventListener("keydown", function (e) {
            if (e.key === "Enter") confirm();
        });
        cancelBtn.addEventListener("click", function () {
            modal.classList.add("hidden");
            callback(getDefaultName());
        });

        input.focus();
    }

    // Reconcilia elementos locales y remotos por id+version
    // Evita que un updateScene remoto sobreescriba lo que el usuario local esta dibujando
    function reconcileElements(localElements, remoteElements) {
        var localMap = {};
        localElements.forEach(function (el) {
            localMap[el.id] = el;
        });

        var seen = {};
        var result = [];

        remoteElements.forEach(function (remoteEl) {
            var localEl = localMap[remoteEl.id];
            if (localEl) {
                // Ambos tienen el elemento: usar el de version mas alta
                result.push((localEl.version || 0) >= (remoteEl.version || 0) ? localEl : remoteEl);
            } else {
                result.push(remoteEl);
            }
            seen[remoteEl.id] = true;
        });

        // Agregar elementos que solo existen localmente (ej: trazo en progreso)
        localElements.forEach(function (localEl) {
            if (!seen[localEl.id]) {
                result.push(localEl);
            }
        });

        return result;
    }

    function startApp(username) {
        var urlParams = new URLSearchParams(window.location.search);
        var ROOM_ID = urlParams.get("room") || "default";

        document.getElementById("room-name").textContent = "Sala: " + ROOM_ID;

        var collab = new CollaborationManager(ROOM_ID, username);
        var excalidrawApi = null;
        var sendTimeout = null;
        var collaborators = new Map();
        // Mapa de versiones recibidas del servidor para evitar echo
        var lastReceivedVersions = {};
        var isApplyingRemote = false;

        function throttledSend(elements, appState, files) {
            // No reenviar si estamos aplicando una actualizacion remota
            if (isApplyingRemote) return;

            // Filtrar elementos que no cambiaron respecto a lo recibido
            var hasLocalChanges = false;
            for (var i = 0; i < elements.length; i++) {
                var el = elements[i];
                var lastVer = lastReceivedVersions[el.id];
                if (lastVer === undefined || el.version > lastVer) {
                    hasLocalChanges = true;
                    break;
                }
            }
            // Tambien considerar si hay elementos nuevos (no en lastReceived)
            if (!hasLocalChanges && elements.length !== Object.keys(lastReceivedVersions).length) {
                hasLocalChanges = true;
            }

            if (!hasLocalChanges) return;

            if (sendTimeout) clearTimeout(sendTimeout);
            sendTimeout = setTimeout(function () {
                collab.sendSceneUpdate(elements, appState, files || {});
            }, 150);
        }

        collab.onSceneUpdate = function (data) {
            if (!excalidrawApi || !data.elements) return;

            // Guardar versiones recibidas para evitar echo
            data.elements.forEach(function (el) {
                lastReceivedVersions[el.id] = el.version || 0;
            });

            // Reconciliar con elementos locales en vez de reemplazar
            var localElements = excalidrawApi.getSceneElements() || [];
            var merged = reconcileElements(localElements, data.elements);

            isApplyingRemote = true;
            excalidrawApi.updateScene({
                elements: merged,
                appState: data.appState || {}
            });

            // Solo agregar archivos nuevos (el filtrado ya se hizo en collaboration.js)
            var newFileValues = data.files ? Object.values(data.files) : [];
            if (newFileValues.length > 0) {
                excalidrawApi.addFiles(newFileValues);
            }

            // Desactivar flag despues de que React procese el cambio
            requestAnimationFrame(function () {
                isApplyingRemote = false;
            });
        };

        collab.onPointerUpdate = function (msg) {
            if (!excalidrawApi) return;

            collaborators.set(msg.clientId, {
                pointer: msg.pointer,
                button: msg.button,
                username: msg.username
            });

            excalidrawApi.updateScene({
                collaborators: collaborators
            });
        };

        collab.onUserDisconnect = function (clientId) {
            if (!excalidrawApi) return;

            collaborators.delete(clientId);
            excalidrawApi.updateScene({
                collaborators: collaborators
            });
        };

        function initExcalidraw() {
            var ExcalidrawLib = window.ExcalidrawLib;
            if (!ExcalidrawLib) {
                console.error("ExcalidrawLib no disponible");
                return;
            }

            var App = function () {
                return React.createElement(ExcalidrawLib.Excalidraw, {
                    excalidrawAPI: function (api) {
                        excalidrawApi = api;
                        document.getElementById("loading-overlay").classList.add("hidden");
                    },
                    onChange: function (elements, appState, files) {
                        throttledSend(elements, appState, files);
                    },
                    onPointerUpdate: function (payload) {
                        collab.sendPointerUpdate(
                            { x: payload.pointer.x, y: payload.pointer.y },
                            payload.button
                        );
                    },
                    isCollaborating: true,
                    initialData: {
                        appState: {
                            viewBackgroundColor: "#ffffff",
                            theme: "light"
                        }
                    },
                    UIOptions: {
                        canvasActions: {
                            loadScene: true,
                            export: { saveFileToDisk: true }
                        }
                    }
                });
            };

            var container = document.getElementById("excalidraw-container");
            var root = ReactDOM.createRoot(container);
            root.render(React.createElement(App));
        }

        function waitForExcalidraw() {
            if (window.ExcalidrawLib) {
                initExcalidraw();
            } else {
                setTimeout(waitForExcalidraw, 200);
            }
        }

        waitForExcalidraw();
    }

    showNameModal(startApp);
})();
