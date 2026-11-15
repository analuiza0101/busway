
// ========================================
// BUSWAY - TEMPO REAL
// ROTAS, PARADAS E PREVISÃO DE CHEGADA
// ========================================

const centroJoaoPessoa = [-7.1195, -34.8450];

// ========================================
// ELEMENTOS HTML
// ========================================

const busList = document.getElementById("busList");
const busSearch = document.getElementById("busSearch");
const vehicleCount = document.getElementById("vehicleCount");
const selectedVehicle = document.getElementById("selectedVehicle");

const menuButton = document.getElementById("menuButton");
const closeMenu = document.getElementById("closeMenu");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");

const toast = document.getElementById("toast");
const centerMapButton = document.getElementById("centerMap");

let selectedBusId = null;
let toastTimeout;

// ========================================
// CONFIGURAÇÕES
// ========================================

const TEMPO_PARADA = 5;
const INTERVALO_MOVIMENTO = 1000;

// ========================================
// MAPA
// ========================================

const map = L.map("map").setView(centroJoaoPessoa, 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// ========================================
// ÔNIBUS SIMULADOS
// ========================================

const buses = [
    {
        id: "BUS-001",
        line: "Linha 301",
        destination: "Centro",
        speed: 28,
        waypoints: [
            [-7.1805, -34.8505],
            [-7.1575, -34.8500],
            [-7.1375, -34.8520],
            [-7.1195, -34.8450]
        ]
    },
    {
        id: "BUS-002",
        line: "Linha 510",
        destination: "Tambaú",
        speed: 25,
        waypoints: [
            [-7.1195, -34.8450],
            [-7.1150, -34.8350],
            [-7.1120, -34.8230]
        ]
    },
    {
        id: "BUS-003",
        line: "Linha 1500",
        destination: "Cabo Branco",
        speed: 22,
        waypoints: [
            [-7.1195, -34.8450],
            [-7.1250, -34.8320],
            [-7.1250, -34.8240]
        ]
    },
    {
        id: "BUS-004",
        line: "Linha 2300",
        destination: "Bancários",
        speed: 20,
        waypoints: [
            [-7.1195, -34.8450],
            [-7.1400, -34.8510],
            [-7.1570, -34.8500]
        ]
    },
    {
        id: "BUS-005",
        line: "Linha 401",
        destination: "Centro",
        speed: 26,
        waypoints: [
            [-7.1500, -34.8750],
            [-7.1370, -34.8620],
            [-7.1195, -34.8450]
        ]
    }
];

// ========================================
// ÍCONES
// ========================================

function createBusIcon() {
    return L.divIcon({
        className: "",
        html: '<div class="bus-map-marker">B</div>',
        iconSize: [34, 34],
        iconAnchor: [17, 17]
    });
}

function createStopIcon() {
    return L.divIcon({
        className: "",
        html: '<div class="stop-map-marker"></div>',
        iconSize: [12, 12],
        iconAnchor: [6, 6]
    });
}

// ========================================
// DISTÂNCIA ENTRE COORDENADAS
// ========================================

function distanceInMeters(pointA, pointB) {
    const earthRadius = 6371000;

    const lat1 = pointA[0] * Math.PI / 180;
    const lat2 = pointB[0] * Math.PI / 180;

    const deltaLat = (pointB[0] - pointA[0]) * Math.PI / 180;
    const deltaLng = (pointB[1] - pointA[1]) * Math.PI / 180;

    const a =
        Math.sin(deltaLat / 2) ** 2 +
        Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(deltaLng / 2) ** 2;

    return 6371000 * 2 * Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
    );
}

// ========================================
// PREPARAR ROTA
// ========================================

function prepareRoute(bus, points) {
    bus.routePoints = points;
    bus.cumulativeDistances = [0];

    let totalDistance = 0;

    for (let i = 1; i < points.length; i++) {
        totalDistance += distanceInMeters(
            points[i - 1],
            points[i]
        );

        bus.cumulativeDistances.push(totalDistance);
    }

    bus.routeLength = totalDistance;
    bus.progress = 0;
    bus.direction = 1;
    bus.routeLoaded = true;
    bus.routeError = false;
    bus.isStopped = false;
    bus.dwellUntil = 0;
    bus.currentStop = null;

    bus.lat = points[0][0];
    bus.lng = points[0][1];

    bus.marker.setLatLng([bus.lat, bus.lng]);

    bus.routeLine = L.polyline(points, {
        color: "#36d17c",
        weight: 4,
        opacity: 0.45,
        lineCap: "round",
        lineJoin: "round"
    }).addTo(map);

    createRouteStops(bus);

    bus.marker.bringToFront();
}

// ========================================
// POSIÇÃO AO LONGO DA ROTA
// ========================================

function getPositionAtDistance(bus, distance) {
    const points = bus.routePoints;
    const distances = bus.cumulativeDistances;

    if (distance <= 0) return points[0];

    if (distance >= bus.routeLength) {
        return points[points.length - 1];
    }

    let segment = 0;

    while (
        segment < distances.length - 1 &&
        distances[segment + 1] < distance
    ) {
        segment++;
    }

    const startDistance = distances[segment];
    const endDistance = distances[segment + 1];

    const segmentLength = endDistance - startDistance;

    const progress = segmentLength === 0
        ? 0
        : (distance - startDistance) / segmentLength;

    const start = points[segment];
    const end = points[segment + 1];

    return [
        start[0] + (end[0] - start[0]) * progress,
        start[1] + (end[1] - start[1]) * progress
    ];
}

// ========================================
// FORMATAR TEMPO
// ========================================

function formatETA(seconds) {
    if (!Number.isFinite(seconds)) {
        return "Indisponível";
    }

    if (seconds <= 0) {
        return "Chegando";
    }

    const minutes = Math.ceil(seconds / 60);

    if (minutes < 1) {
        return "Menos de 1 min";
    }

    if (minutes === 1) {
        return "1 minuto";
    }

    return `${minutes} minutos`;
}

// ========================================
// PREVISÃO DE CHEGADA NA PARADA
// ========================================

function estimateStopArrival(bus, targetStop) {
    if (!bus.routeLoaded || !targetStop) {
        return null;
    }

    if (
        bus.isStopped &&
        bus.currentStop === targetStop
    ) {
        return 0;
    }

    const speed = bus.speed / 3.6;

    if (speed <= 0) {
        return null;
    }

    let distance;

    if (bus.direction === 1) {
        if (targetStop.distance >= bus.progress) {
            distance = targetStop.distance - bus.progress;
        } else {
            distance =
                (bus.routeLength - bus.progress) +
                (bus.routeLength - targetStop.distance);
        }
    } else {
        if (targetStop.distance <= bus.progress) {
            distance = bus.progress - targetStop.distance;
        } else {
            distance =
                bus.progress +
                targetStop.distance;
        }
    }

    let estimatedSeconds = distance / speed;

    // Se estiver parado, considera o tempo restante da parada.
    if (bus.isStopped) {
        estimatedSeconds += Math.max(
            0,
            (bus.dwellUntil - Date.now()) / 1000
        );
    }

    // Conta as paradas que o ônibus encontrará antes do destino.
    const stopsAhead = bus.stops.filter(stop => {
        if (stop === targetStop) return false;

        if (bus.direction === 1) {
            if (targetStop.distance >= bus.progress) {
                return (
                    stop.distance > bus.progress &&
                    stop.distance < targetStop.distance
                );
            }

            return (
                stop.distance > bus.progress ||
                stop.distance < targetStop.distance
            );
        }

        if (targetStop.distance <= bus.progress) {
            return (
                stop.distance < bus.progress &&
                stop.distance > targetStop.distance
            );
        }

        return (
            stop.distance < bus.progress ||
            stop.distance > targetStop.distance
        );
    });

    estimatedSeconds +=
        stopsAhead.length * TEMPO_PARADA;

    return estimatedSeconds;
}

// ========================================
// CONTEÚDO DO POPUP DA PARADA
// ========================================

function getStopPopupContent(bus, stop) {
    const eta = estimateStopArrival(bus, stop);

    let status = "Em percurso";

    if (!bus.routeLoaded) {
        status = "Calculando trajeto";
    } else if (
        bus.isStopped &&
        bus.currentStop === stop
    ) {
        status = "Ônibus nesta parada";
    } else if (bus.isStopped) {
        status = "Ônibus parado em outra parada";
    }

    return `
        <div style="min-width:190px;font-family:Arial,sans-serif;">
            <strong style="font-size:14px;">
                Parada ${stop.number}
            </strong>

            <p style="margin:7px 0 3px;">
                <strong>${bus.line}</strong>
            </p>

            <p style="margin:3px 0;color:#666;">
                Destino: ${bus.destination}
            </p>

            <hr style="border:0;border-top:1px solid #ddd;margin:9px 0;">

            <p style="margin:4px 0;">
                <strong>Chegada estimada:</strong>
            </p>

            <p style="margin:4px 0;color:#198754;font-size:16px;font-weight:bold;">
                ${eta === null ? "Aguardando rota" : formatETA(eta)}
            </p>

            <small style="color:#777;">
                ${status}
            </small>

            <p style="font-size:10px;color:#999;margin-top:8px;">
                Previsão simulada, não oficial.
            </p>
        </div>
    `;
}

// ========================================
// CRIAR PARADAS NA ROTA
// ========================================

function createRouteStops(bus) {
    bus.stops = [];

    const interval = 700;
    const margin = 250;

    if (bus.routeLength < margin * 2) {
        return;
    }

    let stopNumber = 1;

    for (
        let distance = interval;
        distance < bus.routeLength - margin;
        distance += interval
    ) {
        const position = getPositionAtDistance(
            bus,
            distance
        );

        const stop = {
            number: stopNumber,
            distance: distance,
            marker: null
        };

        stop.marker = L.marker(position, {
            icon: createStopIcon()
        }).addTo(map);

        stop.marker.bindPopup(
            getStopPopupContent(bus, stop)
        );

        stop.marker.on("click", () => {
            stop.marker.setPopupContent(
                getStopPopupContent(bus, stop)
            );

            stop.marker.openPopup();
        });

        bus.stops.push(stop);

        stopNumber++;
    }
}

// ========================================
// ATUALIZAR PREVISÕES NOS POPUPS
// ========================================

function updateStopPopups() {
    buses.forEach(bus => {
        if (!bus.routeLoaded) return;

        bus.stops.forEach(stop => {
            stop.marker.setPopupContent(
                getStopPopupContent(bus, stop)
            );
        });
    });
}

// ========================================
// CARREGAR ROTAS PELAS RUAS
// ========================================

async function loadBusRoute(bus) {
    try {
        const coordinates = bus.waypoints
            .map(([lat, lng]) => `${lng},${lat}`)
            .join(";");

        const url =
            `https://router.project-osrm.org/route/v1/driving/${coordinates}` +
            `?overview=full&geometries=geojson&steps=false`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("Erro ao consultar serviço de rotas.");
        }

        const data = await response.json();

        if (
            data.code !== "Ok" ||
            !data.routes ||
            !data.routes.length
        ) {
            throw new Error("Nenhuma rota encontrada.");
        }

        const routePoints =
            data.routes[0].geometry.coordinates.map(
                coordinate => [
                    coordinate[1],
                    coordinate[0]
                ]
            );

        if (routePoints.length < 2) {
            throw new Error("Trajeto insuficiente.");
        }

        prepareRoute(bus, routePoints);

        renderBusList(busSearch.value);

        if (selectedBusId === bus.id) {
            updateSelectedVehicle(bus);
        }

    } catch (error) {
        console.error(`Erro na rota ${bus.line}:`, error);

        bus.routeError = true;

        renderBusList(busSearch.value);
    }
}

// ========================================
// VERIFICAR CHEGADA À PARADA
// ========================================

function checkBusStops(bus, previousProgress, newProgress) {
    if (bus.isStopped) {
        if (Date.now() >= bus.dwellUntil) {
            bus.isStopped = false;
            bus.currentStop = null;
        } else {
            return;
        }
    }

    const reachedStop = bus.stops.find(stop => {
        if (bus.direction === 1) {
            return (
                previousProgress < stop.distance &&
                newProgress >= stop.distance
            );
        }

        return (
            previousProgress > stop.distance &&
            newProgress <= stop.distance
        );
    });

    if (reachedStop) {
        bus.progress = reachedStop.distance;
        bus.isStopped = true;
        bus.currentStop = reachedStop;
        bus.dwellUntil = Date.now() + TEMPO_PARADA * 1000;

        bus.marker.setLatLng(
            getPositionAtDistance(bus, bus.progress)
        );

        reachedStop.marker.openPopup();

        if (selectedBusId === bus.id) {
            updateSelectedVehicle(bus);
        }
    }
}

// ========================================
// MOVIMENTAÇÃO DOS ÔNIBUS
// ========================================

function moveBuses() {
    buses.forEach(bus => {
        if (!bus.routeLoaded || bus.routeLength <= 0) {
            return;
        }

        if (bus.isStopped) {
            if (Date.now() >= bus.dwellUntil) {
                bus.isStopped = false;
                bus.currentStop = null;
            } else {
                return;
            }
        }

        const previousProgress = bus.progress;
        const metersPerSecond = bus.speed / 3.6;

        let newProgress =
            bus.progress +
            metersPerSecond *
            (INTERVALO_MOVIMENTO / 1000) *
            bus.direction;

        if (newProgress >= bus.routeLength) {
            newProgress = bus.routeLength;
            bus.direction = -1;
        }

        if (newProgress <= 0) {
            newProgress = 0;
            bus.direction = 1;
        }

        checkBusStops(
            bus,
            previousProgress,
            newProgress
        );

        if (!bus.isStopped) {
            bus.progress = newProgress;
        }

        const position = getPositionAtDistance(
            bus,
            bus.progress
        );

        bus.lat = position[0];
        bus.lng = position[1];

        bus.marker.setLatLng(position);
    });
}

// ========================================
// LISTA DE ÔNIBUS
// ========================================

function renderBusList(search = "") {
    const searchText = search.toLowerCase();

    const filteredBuses = buses.filter(bus => {
        return (
            bus.line.toLowerCase().includes(searchText) ||
            bus.id.toLowerCase().includes(searchText) ||
            bus.destination.toLowerCase().includes(searchText)
        );
    });

    vehicleCount.textContent = filteredBuses.length;

    if (filteredBuses.length === 0) {
        busList.innerHTML = `
            <div class="empty-list">
                Nenhum ônibus encontrado.
            </div>
        `;

        return;
    }

    busList.innerHTML = filteredBuses.map(bus => {
        let statusText = "Calculando rota";

        if (bus.routeLoaded) {
            statusText = bus.isStopped
                ? "● Na parada"
                : "● Em movimento";
        }

        if (bus.routeError) {
            statusText = "Rota indisponível";
        }

        return `
            <button
                class="bus-card ${selectedBusId === bus.id ? "selected" : ""}"
                data-id="${bus.id}"
                type="button"
            >
                <span class="bus-icon">🚌</span>

                <span class="bus-info">
                    <strong>${bus.line}</strong>
                    <small>${bus.destination}</small>
                </span>

                <span class="bus-status">${statusText}</span>
            </button>
        `;
    }).join("");

    document.querySelectorAll(".bus-card").forEach(card => {
        card.addEventListener("click", () => {
            selectBus(card.dataset.id);
        });
    });
}

// ========================================
// DETALHES DO VEÍCULO
// ========================================

function updateSelectedVehicle(bus) {
    let routeStatus = "Calculando trajeto";
    let stopInformation = "Aguardando rota";

    if (bus.routeLoaded) {
        routeStatus = bus.isStopped
            ? "Parado em uma parada"
            : "Seguindo trajeto pelas ruas";

        stopInformation = bus.isStopped
            ? `Parada ${bus.currentStop.number}`
            : `${bus.stops.length} paradas no trajeto`;
    }

    if (bus.routeError) {
        routeStatus = "Não foi possível calcular o trajeto";
        stopInformation = "Indisponível";
    }

    selectedVehicle.innerHTML = `
        <div class="vehicle-details">

            <div>
                <h3>${bus.line}</h3>

                <p>
                    Veículo ${bus.id} · Destino: ${bus.destination}
                </p>

                <span class="detail-tag">
                    ${routeStatus}
                </span>
            </div>

            <div class="detail-item">
                <small>Velocidade simulada</small>
                <strong>${bus.isStopped ? "0 km/h" : `${bus.speed} km/h`}</strong>
            </div>

            <div class="detail-item">
                <small>Paradas no trajeto</small>
                <strong>${stopInformation}</strong>
            </div>

            <div class="detail-item">
                <small>Identificação</small>
                <strong>${bus.id}</strong>
            </div>

        </div>
    `;
}

// ========================================
// SELECIONAR ÔNIBUS
// ========================================

function selectBus(id) {
    const bus = buses.find(item => item.id === id);

    if (!bus) return;

    selectedBusId = id;

    renderBusList(busSearch.value);
    updateSelectedVehicle(bus);

    map.flyTo([bus.lat, bus.lng], 15, {
        duration: 1
    });

    bus.marker.openPopup();
}

// ========================================
// BUSCA
// ========================================

busSearch.addEventListener("input", () => {
    renderBusList(busSearch.value);
});

// ========================================
// CENTRALIZAR MAPA
// ========================================

centerMapButton.addEventListener("click", () => {
    map.flyTo(centroJoaoPessoa, 13, {
        duration: 1
    });
});

// ========================================
// MENU LATERAL
// ========================================

function openMenu() {
    sidebar.classList.add("open");
    sidebarOverlay.classList.add("show");
}

function closeSidebar() {
    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("show");
}

menuButton.addEventListener("click", openMenu);
closeMenu.addEventListener("click", closeSidebar);
sidebarOverlay.addEventListener("click", closeSidebar);

// ========================================
// OPÇÕES DO MENU
// ========================================

document.querySelectorAll(".menu-option").forEach(option => {
    option.addEventListener("click", () => {
        showToast(option.dataset.message);
    });
});

// ========================================
// NOTIFICAÇÕES
// ========================================

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimeout);

    toastTimeout = setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

// ========================================
// INICIALIZAÇÃO
// ========================================

renderBusList();

map.whenReady(() => {
    setTimeout(() => {
        map.invalidateSize();
    }, 200);
});

async function initializeRoutes() {
    await Promise.allSettled(
        buses.map(bus => loadBusRoute(bus))
    );

    const errors = buses.filter(bus => bus.routeError);

    if (errors.length > 0) {
        showToast(
            "Alguns trajetos não puderam ser carregados."
        );
    }
}

// Atualiza os ônibus a cada segundo.
setInterval(moveBuses, INTERVALO_MOVIMENTO);

// Atualiza os horários das paradas a cada 5 segundos.
setInterval(updateStopPopups, 5000);

// Atualiza a lista e os detalhes.
setInterval(() => {
    renderBusList(busSearch.value);

    if (selectedBusId) {
        const bus = buses.find(item => item.id === selectedBusId);

        if (bus) {
            updateSelectedVehicle(bus);
        }
    }
}, 1000);

// Carrega as rotas.
initializeRoutes();
