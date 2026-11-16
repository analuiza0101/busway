// ========================================
// BUSWAY - TEMPO REAL
// ÔNIBUS, ROTAS, PARADAS E MOVIMENTAÇÃO
// ========================================

const centroJoaoPessoa = [-7.1195, -34.8450];

const busList = document.getElementById("busList");
const busSearch = document.getElementById("busSearch");
const vehicleCount = document.getElementById("vehicleCount");
const selectedVehicle = document.getElementById("selectedVehicle");
const centerMapButton = document.getElementById("centerMap");
const toast = document.getElementById("toast");

let selectedBusId = null;
let toastTimeout;

// Configurações
const INTERVALO_MOVIMENTO = 1000;
const TEMPO_PARADA = 5;

// ========================================
// MAPA
// ========================================

const map = L.map("map").setView(centroJoaoPessoa, 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; OpenStreetMap'
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
// CRIAR MARCADORES DOS ÔNIBUS
// ========================================

// IMPORTANTE: os marcadores são criados antes
// de carregar as rotas.

buses.forEach(bus => {

    bus.lat = bus.waypoints[0][0];
    bus.lng = bus.waypoints[0][1];

    bus.marker = L.marker(
        [bus.lat, bus.lng],
        { icon: createBusIcon() }
    ).addTo(map);

    bus.marker.bindPopup(`
        <strong>${bus.line}</strong><br>
        Destino: ${bus.destination}<br>
        Veículo: ${bus.id}
    `);

    bus.routeLoaded = false;
    bus.routeError = false;
    bus.stops = [];
});

// ========================================
// DISTÂNCIA ENTRE COORDENADAS
// ========================================

function distanceInMeters(a, b) {

    const earthRadius = 6371000;

    const lat1 = a[0] * Math.PI / 180;
    const lat2 = b[0] * Math.PI / 180;

    const deltaLat = (b[0] - a[0]) * Math.PI / 180;
    const deltaLng = (b[1] - a[1]) * Math.PI / 180;

    const value =
        Math.sin(deltaLat / 2) ** 2 +
        Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(deltaLng / 2) ** 2;

    return earthRadius * 2 *
        Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
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

    const position = getPositionAtDistance(bus, 0);

    bus.lat = position[0];
    bus.lng = position[1];

    bus.marker.setLatLng(position);

    if (bus.routeLine) {
        map.removeLayer(bus.routeLine);
    }

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

    const progress =
        (distance - startDistance) /
        (endDistance - startDistance);

    const start = points[segment];
    const end = points[segment + 1];

    return [
        start[0] + (end[0] - start[0]) * progress,
        start[1] + (end[1] - start[1]) * progress
    ];
}

// ========================================
// PARADAS
// ========================================

function createRouteStops(bus) {

    bus.stops.forEach(stop => {
        map.removeLayer(stop.marker);
    });

    bus.stops = [];

    const interval = 700;
    let number = 1;

    for (
        let distance = interval;
        distance < bus.routeLength - 250;
        distance += interval
    ) {

        const position = getPositionAtDistance(bus, distance);

        const stop = {
            number,
            distance,
            marker: null
        };

        stop.marker = L.marker(position, {
            icon: createStopIcon()
        }).addTo(map);

        stop.marker.bindPopup(`
            <strong>Parada ${number}</strong><br>
            ${bus.line}<br>
            Destino: ${bus.destination}<br>
            <small>Previsão simulada.</small>
        `);

        bus.stops.push(stop);

        number++;
    }
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
            "?overview=full&geometries=geojson&steps=false";

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("Serviço de rotas indisponível.");
        }

        const data = await response.json();

        if (
            data.code !== "Ok" ||
            !data.routes ||
            !data.routes.length
        ) {
            throw new Error("Rota não encontrada.");
        }

        const points = data.routes[0].geometry.coordinates.map(
            coordinate => [
                coordinate[1],
                coordinate[0]
            ]
        );

        if (points.length < 2) {
            throw new Error("Trajeto inválido.");
        }

        prepareRoute(bus, points);

    } catch (error) {

        console.warn(
            `Usando rota simulada para ${bus.line}:`,
            error
        );

        // Se o serviço externo falhar, utiliza
        // os pontos definidos no próprio projeto.

        prepareRoute(bus, bus.waypoints);
    }

    renderBusList(busSearch ? busSearch.value : "");
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

            if (Date.now() < bus.dwellUntil) {
                return;
            }

            bus.isStopped = false;
            bus.currentStop = null;
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

        // Verifica se chegou a uma parada.

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

            reachedStop.marker.openPopup();

        } else {

            bus.progress = newProgress;
        }

        const position = getPositionAtDistance(
            bus,
            bus.progress
        );

        bus.lat = position[0];
        bus.lng = position[1];

        bus.marker.setLatLng(position);
        bus.marker.bringToFront();
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

        let status = "Carregando rota";

        if (bus.routeLoaded) {
            status = bus.isStopped
                ? "● Na parada"
                : "● Em movimento";
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

                <span class="bus-status">${status}</span>
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

    let status = "Carregando trajeto";

    if (bus.routeLoaded) {
        status = bus.isStopped
            ? "Parado em uma parada"
            : "Seguindo trajeto pelas ruas";
    }

    selectedVehicle.innerHTML = `
        <div class="vehicle-details">

            <div>
                <h3>${bus.line}</h3>

                <p>
                    Veículo ${bus.id} · Destino: ${bus.destination}
                </p>

                <span class="detail-tag">
                    ${status}
                </span>
            </div>

            <div class="detail-item">
                <small>Velocidade simulada</small>
                <strong>
                    ${bus.isStopped ? "0 km/h" : bus.speed + " km/h"}
                </strong>
            </div>

            <div class="detail-item">
                <small>Paradas no trajeto</small>
                <strong>${bus.stops.length}</strong>
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
    }, 300);

});

// Inicia a movimentação automática.

setInterval(() => {

    moveBuses();

}, INTERVALO_MOVIMENTO);

// Atualiza a lista e os detalhes.

setInterval(() => {

    renderBusList(busSearch.value);

    if (selectedBusId) {

        const bus = buses.find(
            item => item.id === selectedBusId
        );

        if (bus) {
            updateSelectedVehicle(bus);
        }
    }

}, 1000);

// Carrega as rotas de todos os ônibus.

async function initializeRoutes() {

    await Promise.allSettled(
        buses.map(bus => loadBusRoute(bus))
    );

    showToast("Ônibus carregados no mapa!");

}

initializeRoutes();
