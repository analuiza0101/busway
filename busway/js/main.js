/*menu lateral*/

const menuButton = document.getElementById("menuButton");
const closeButton = document.getElementById("closeButton");
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");
const notification = document.getElementById("notification");

function openMenu() {
    sidebar.classList.add("active");
    overlay.classList.add("active");
    menuButton.setAttribute("aria-expanded", "true");
}

function closeMenu() {
    sidebar.classList.remove("active");
    overlay.classList.remove("active");
    menuButton.setAttribute("aria-expanded", "false");
}

menuButton.addEventListener("click", openMenu);
closeButton.addEventListener("click", closeMenu);
overlay.addEventListener("click", closeMenu);

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
});

//notificacoes

let notificationTimeout;

function showNotification(message) {
    notification.textContent = message;
    notification.classList.add("show");

    clearTimeout(notificationTimeout);

    notificationTimeout = setTimeout(() => {
        notification.classList.remove("show");
    }, 3000);
}

document.querySelectorAll(".menu-item").forEach((item) => {
    item.addEventListener("click", () => {
        const section = item.dataset.section;
        closeMenu();
        showNotification(section + " será desenvolvido em breve!");
    });
});

//mapa

const mapStatus = document.getElementById("mapStatus");
const locationButton = document.getElementById("locationButton");

const joaoPessoa = [-7.1195, -34.8450];

const map = L.map("map", {
    zoomControl: false,
}).setView(joaoPessoa, 13);

L.control.zoom({
    position: "bottomright"
}).addTo(map);

map.getPane("tilePane").style.filter =
    "invert(100%) hue-rotate(180deg) brightness(85%) contrast(90%) saturate(65%)";

L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
    }
).addTo(map);

//fonte dos dados

const emsStopsURL =
    "https://horarios.clickbuspb.com.br/dados/vetores/paradas.geojson";

const emsRoutesURL =
    "https://horarios.clickbuspb.com.br/dados/vetores/itinerarios-originais.geojson";

const overpassURL =
    "https://overpass-api.de/api/interpreter";

const MAX_ROUTE_DISTANCE = 80;

//funcoes de consulta

async function consultarGeoJSON(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error("Erro ao acessar os dados EMS.");
    }

    return await response.json();
}

async function consultarOverpass(query) {
    const response = await fetch(overpassURL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
        },
        body: "data=" + encodeURIComponent(query)
    });

    if (!response.ok) {
        throw new Error("Erro ao consultar OpenStreetMap.");
    }

    return await response.json();
}

//icones

const busIcon = L.divIcon({
    className: "",
    html: '<div class="bus-marker">B</div>',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
});

const userIcon = L.divIcon({
    className: "",
    html: '<div class="user-marker"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
});

//camadas

const busStopsLayer = L.layerGroup().addTo(map);
const busRoutesLayer = L.layerGroup().addTo(map);

let userMarker = null;
let userAccuracyCircle = null;

let allStops = [];
let emsRouteFeatures = [];

//cache

const routeCache = new Map();
const routeRequests = new Map();

//proteger textos

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => {
        const characters = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };

        return characters[character];
    });
}

//distância entre dois pontos

function distanceBetween(lat1, lon1, lat2, lon2) {
    const earthRadius = 6371000;

    const toRadians = value => value * Math.PI / 180;

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return 2 * earthRadius *
        Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

//distância para segmento

function distanceToSegment(stop, start, end) {

    const earthRadius = 6371000;

    const radians = value => value * Math.PI / 180;

    const referenceLatitude = radians(stop.lat);

    function convert(point) {
        return {
            x: radians(point[0] - stop.lon) *
                earthRadius * Math.cos(referenceLatitude),

            y: radians(point[1] - stop.lat) *
                earthRadius
        };
    }

    const a = convert(start);
    const b = convert(end);

    const dx = b.x - a.x;
    const dy = b.y - a.y;

    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
        return Math.sqrt(a.x * a.x + a.y * a.y);
    }

    let t = -(a.x * dx + a.y * dy) / lengthSquared;

    t = Math.max(0, Math.min(1, t));

    const closestX = a.x + t * dx;
    const closestY = a.y + t * dy;

    return Math.sqrt(
        closestX * closestX +
        closestY * closestY
    );
}

//obter distância do itinerário

function getRouteDistance(stop, geometry) {

    if (!geometry) return Infinity;

    let minimumDistance = Infinity;

    function processLine(coordinates) {

        if (!Array.isArray(coordinates)) return;

        if (coordinates.length === 1) {

            const point = coordinates[0];

            if (Array.isArray(point)) {
                minimumDistance = Math.min(
                    minimumDistance,
                    distanceBetween(
                        stop.lat,
                        stop.lon,
                        point[1],
                        point[0]
                    )
                );
            }

            return;
        }

        for (let i = 0; i < coordinates.length - 1; i++) {

            const start = coordinates[i];
            const end = coordinates[i + 1];

            if (
                !Array.isArray(start) ||
                !Array.isArray(end) ||
                !Number.isFinite(start[0]) ||
                !Number.isFinite(start[1]) ||
                !Number.isFinite(end[0]) ||
                !Number.isFinite(end[1])
            ) {
                continue;
            }

            const distance = distanceToSegment(
                stop,
                start,
                end
            );

            minimumDistance = Math.min(
                minimumDistance,
                distance
            );

        }
    }

    if (geometry.type === "LineString") {

        processLine(geometry.coordinates);

    } else if (geometry.type === "MultiLineString") {

        geometry.coordinates.forEach(processLine);

    } else if (geometry.type === "GeometryCollection") {

        geometry.geometries.forEach((item) => {

            const distance = getRouteDistance(stop, item);

            minimumDistance = Math.min(
                minimumDistance,
                distance
            );

        });

    }

    return minimumDistance;
}

//encontrar linhas próximas

function findNearbyEMSRoutes(stop) {

    const nearbyRoutes = [];

    emsRouteFeatures.forEach((feature) => {

        const distance = getRouteDistance(
            stop,
            feature.geometry
        );

        if (distance <= MAX_ROUTE_DISTANCE) {

            nearbyRoutes.push({

                type: "EMS",

                id: feature.properties?.route_id,

                tags: feature.properties || {},

                distance: distance

            });

        }

    });

    /*
    Remove repetições da mesma linha
    e do mesmo sentido.
    */

    const uniqueRoutes = new Map();

    nearbyRoutes.forEach((route) => {

        const properties = route.tags;

        const key = [
            properties.line_code,
            properties.direction_code,
            properties.direction_name
        ].join("-");

        if (
            !uniqueRoutes.has(key) ||
            route.distance < uniqueRoutes.get(key).distance
        ) {
            uniqueRoutes.set(key, route);
        }

    });

    return Array.from(uniqueRoutes.values())
        .sort((a, b) => a.distance - b.distance);
}

//normalizar paradas EMS

function normalizeEMSStop(feature) {

    const properties = feature.properties || {};

    let latitude;
    let longitude;

    if (
        feature.geometry &&
        feature.geometry.type === "Point"
    ) {
        longitude = feature.geometry.coordinates[0];
        latitude = feature.geometry.coordinates[1];
    } else {
        latitude = Number(properties.latitude);
        longitude = Number(properties.longitude);
    }

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
    ) {
        return null;
    }

    return {

        id: "ems-" + (
            properties.stop_id ??
            properties.source_stop_id ??
            latitude + "-" + longitude
        ),

        lat: latitude,
        lon: longitude,

        source: "EMS",

        tags: {
            name: properties.stop_name || properties.short_name || "Parada sem nome",
            "addr:full": properties.address || "",
            ref: properties.short_name || properties.source_stop_id || "",
            operator: properties.publisher_name || "",
            municipality: properties.municipality || ""
        }

    };
}

//normalizar paradas OSM

function normalizeOSMStop(stop) {
    return {
        id: stop.id,
        lat: stop.lat,
        lon: stop.lon,
        source: "OSM",
        tags: stop.tags || {}
    };
}

//verificar duplicação

function isDuplicateStop(stop, existingStops) {

    return existingStops.some(existing => {

        return distanceBetween(
            stop.lat,
            stop.lon,
            existing.lat,
            existing.lon
        ) <= 20;

    });
}

//endereço

function getStopAddress(tags) {

    if (tags["addr:full"]) {
        return tags["addr:full"];
    }

    const parts = [];

    if (tags["addr:street"]) {

        let address = tags["addr:street"];

        if (tags["addr:housenumber"]) {
            address += ", " + tags["addr:housenumber"];
        }

        parts.push(address);
    }

    if (tags["addr:suburb"]) {
        parts.push(tags["addr:suburb"]);
    }

    if (tags["addr:city"]) {
        parts.push(tags["addr:city"]);
    }

    return parts.length
        ? parts.join(", ")
        : "Endereço não informado";
}

//mostra linhas no popup


function createRoutesContent(routes) {

    if (!routes.length) {

        return `
            <p class="stop-message">
                Nenhum itinerário próximo foi encontrado
                dentro da distância de pesquisa.
            </p>

            <p class="stop-message">
                Isso não significa que a parada não seja
                atendida por ônibus.
            </p>
        `;

    }

    const groupedRoutes = new Map();

    routes.forEach(route => {

        const tags = route.tags || {};

        const line = escapeHTML(
            tags.line_code ||
            tags.route_name ||
            tags.ref ||
            "Linha sem identificação"
        );

        const name = escapeHTML(
            tags.route_name || "Nome não informado"
        );

        const direction = escapeHTML(
            tags.direction_name || "Sentido não informado"
        );

        const key = line + "-" + name;

        if (!groupedRoutes.has(key)) {

            groupedRoutes.set(key, {
                line,
                name,
                directions: []
            });

        }

        const group = groupedRoutes.get(key);

        if (!group.directions.includes(direction)) {
            group.directions.push(direction);
        }

    });

    return Array.from(groupedRoutes.values())
        .map(route => `

            <div class="stop-route-item">

                <span class="route-tag">
                    ${route.line}
                </span>

                <p class="stop-message">
                    <strong>Nome:</strong> ${route.name}
                </p>

                <p class="stop-message">
                    <strong>Sentidos:</strong>
                </p>

                <ul>
                    ${route.directions.map(direction => `
                        <li>${direction}</li>
                    `).join("")}
                </ul>

            </div>

        `).join("") + `

            <p class="stop-message">
                Possíveis itinerários próximos. A proximidade
                não confirma que a linha atenda esta parada.
            </p>

        `;
}

//popup da parada

function createStopPopup(stop, routesContent = "") {

    const tags = stop.tags || {};

    const name = escapeHTML(
        tags.name || "Ponto de ônibus sem nome"
    );

    const address = escapeHTML(
        getStopAddress(tags)
    );

    const reference = escapeHTML(
        tags.ref || "Não informado"
    );

    const operator = escapeHTML(
        tags.operator || "Não informado"
    );

    const source = stop.source === "EMS"
        ? "Horários EMS"
        : "OpenStreetMap";

    const sourceLink = stop.source === "EMS"
        ? "https://horarios.clickbuspb.com.br/dados-vetoriais"
        : `https://www.openstreetmap.org/node/${stop.id}`;

    return `

        <div class="stop-popup">

            <h3 class="stop-popup-title">
                ${name}
            </h3>

            <div class="stop-popup-row">
                <strong>Endereço:</strong> ${address}
            </div>

            <div class="stop-popup-row">
                <strong>Identificação:</strong> ${reference}
            </div>


            <div class="stop-routes">

                <h4>Linhas de ônibus</h4>

                ${routesContent || `
                    <p class="stop-message">
                        Consultando itinerários próximos...
                    </p>
                `}

            </div>

            <span class="stop-source">
                Fonte: ${source}
            </span>

            <a
                class="stop-link"
                href="${sourceLink}"
                target="_blank"
                rel="noopener noreferrer"
            >
                Consultar fonte dos dados
            </a>

        </div>

    `;
}

//carregar rotas da parada

async function loadStopRoutes(stop, marker) {

    if (routeCache.has(stop.id)) {

        marker.setPopupContent(
            createStopPopup(
                stop,
                createRoutesContent(routeCache.get(stop.id))
            )
        );

        return;
    }

    if (routeRequests.has(stop.id)) return;

    const request = (async () => {

        try {

            marker.setPopupContent(
                createStopPopup(
                    stop,
                    '<p class="stop-message">Analisando itinerários...</p>'
                )
            );

            /*
            Busca os itinerários EMS próximos.
            */

            const emsRoutes = findNearbyEMSRoutes(stop);

            /*
            Se a parada veio do OSM,
            consulta também as relações de ônibus.
            */

            let osmRoutes = [];

            if (stop.source === "OSM") {

                const query = `

                    [out:json][timeout:20];

                    node(${stop.id});

                    rel(bn);

                    out tags;

                `;

                const data = await consultarOverpass(query);

                osmRoutes = (data.elements || [])
                    .filter(element =>
                        element.type === "relation" &&
                        element.tags?.route === "bus"
                    )
                    .map(route => ({

                        type: "OSM",

                        id: route.id,

                        tags: route.tags,

                        distance: 0

                    }));

            }

            const routes = [
                ...emsRoutes,
                ...osmRoutes
            ];

            routeCache.set(stop.id, routes);

            marker.setPopupContent(
                createStopPopup(
                    stop,
                    createRoutesContent(routes)
                )
            );

        } catch (error) {

            console.error(
                "Erro ao consultar linhas:",
                error
            );

            const routes = findNearbyEMSRoutes(stop);

            marker.setPopupContent(
                createStopPopup(
                    stop,
                    createRoutesContent(routes)
                )
            );

        } finally {

            routeRequests.delete(stop.id);

        }

    })();

    routeRequests.set(stop.id, request);

    await request;
}

//carrega itinerários EMS

async function loadEMSRoutes() {

    const data = await consultarGeoJSON(emsRoutesURL);

    emsRouteFeatures = data.features || [];

    busRoutesLayer.clearLayers();

    const routes = L.geoJSON(data, {

        style: {
            color: "#19b89a",
            weight: 4,
            opacity: 0.8
        },

        onEachFeature: (feature, layer) => {

            const properties = feature.properties || {};

            const line = escapeHTML(
                properties.line_code || "Sem identificação"
            );

            const name = escapeHTML(
                properties.route_name || "Não informado"
            );

            const direction = escapeHTML(
                properties.direction_name || "Não informado"
            );

            const operator = escapeHTML(
                properties.operator_name || "Não informado"
            );

            layer.bindPopup(`

                <div class="stop-popup">

                    <h3 class="stop-popup-title">
                        Linha ${line}
                    </h3>

                    <p class="stop-popup-row">
                        <strong>Nome:</strong> ${name}
                    </p>

                    <p class="stop-popup-row">
                        <strong>Sentido:</strong> ${direction}
                    </p>

                    <p class="stop-popup-row">
                        <strong>Operadora:</strong> ${operator}
                    </p>

                    <p class="stop-message">
                        Itinerário original do Horários EMS.
                        O traçado ainda não foi ajustado às ruas.
                    </p>

                </div>

            `);

        }

    });

    busRoutesLayer.addLayer(routes);

    console.log(
        "Itinerários carregados:",
        emsRouteFeatures.length
    );
}

//carrega paradas EMS

async function loadEMSStops() {

    const data = await consultarGeoJSON(emsStopsURL);

    return (data.features || [])
        .map(normalizeEMSStop)
        .filter(Boolean);
}

//carrega paradas OSM

async function loadOSMStops() {

    const south = -7.25;
    const west = -34.98;
    const north = -7.00;
    const east = -34.72;

    const query = `

        [out:json][timeout:30];

        (

            node["highway"="bus_stop"]
            (${south},${west},${north},${east});

            node["public_transport"="platform"]["bus"="yes"]
            (${south},${west},${north},${east});

        );

        out body;

    `;

    const data = await consultarOverpass(query);

    const uniqueStops = new Map();

    (data.elements || []).forEach(stop => {

        if (
            stop.type === "node" &&
            Number.isFinite(stop.lat) &&
            Number.isFinite(stop.lon)
        ) {
            uniqueStops.set(stop.id, stop);
        }

    });

    return Array.from(uniqueStops.values())
        .map(normalizeOSMStop);
}

//exibe paradas

function displayBusStops(stops) {

    busStopsLayer.clearLayers();

    stops.forEach(stop => {

        const marker = L.marker(
            [stop.lat, stop.lon],
            {
                icon: busIcon,
                title: stop.tags.name || "Ponto de ônibus"
            }
        );

        marker.bindPopup(
            createStopPopup(stop),
            {
                maxWidth: 340,
                minWidth: 230,
                maxHeight: 380,
                autoPan: true,
                autoPanPadding: [20, 20]
            }
        );

        marker.on("popupopen", () => {
            loadStopRoutes(stop, marker);
        });

        busStopsLayer.addLayer(marker);

    });

}

//carrega dados

async function loadBusStops() {

    mapStatus.textContent =
        "Buscando paradas e itinerários...";

    busStopsLayer.clearLayers();
    busRoutesLayer.clearLayers();

    allStops = [];
    emsRouteFeatures = [];

    routeCache.clear();

    let emsStops = [];
    let osmStops = [];

    let emsAvailable = false;
    let osmAvailable = false;

    let routesAvailable = false;

    //Consulta as três fontes.

    const results = await Promise.allSettled([

        loadEMSStops(),
        loadOSMStops(),
        loadEMSRoutes()

    ]);

    if (results[0].status === "fulfilled") {
        emsStops = results[0].value;
        emsAvailable = true;
    } else {
        console.error("Erro nas paradas EMS:", results[0].reason);
    }

    if (results[1].status === "fulfilled") {
        osmStops = results[1].value;
        osmAvailable = true;
    } else {
        console.error("Erro nas paradas OSM:", results[1].reason);
    }

    if (results[2].status === "fulfilled") {
        routesAvailable = true;
    } else {
        console.error("Erro nos itinerários:", results[2].reason);
    }

    //Combina as duas bases.


    const combinedStops = [...emsStops];

    osmStops.forEach(stop => {

        if (!isDuplicateStop(stop, combinedStops)) {
            combinedStops.push(stop);
        }

    });

    allStops = combinedStops;

    displayBusStops(allStops);

    //Status do mapa.
    

    if (emsAvailable && osmAvailable && routesAvailable) {

        mapStatus.textContent =
            allStops.length +
            " paradas e itinerários carregados.";

    } else if (emsAvailable || osmAvailable) {

        mapStatus.textContent =
            allStops.length +
            " paradas carregadas. Algumas fontes estão indisponíveis.";

    } else {

        mapStatus.textContent =
            "Não foi possível carregar as paradas.";

        showNotification(
            "Erro ao consultar os dados de transporte."
        );

    }

    console.log("Paradas:", allStops.length);
    console.log("Itinerários:", emsRouteFeatures.length);

}

//gps

function locateUser() {

    if (!navigator.geolocation) {

        showNotification("Seu navegador não suporta GPS.");

        return;
    }

    mapStatus.textContent =
        "Buscando sua localização...";

    navigator.geolocation.getCurrentPosition(

        position => {

            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;
            const accuracy = position.coords.accuracy;

            const userPosition = [
                latitude,
                longitude
            ];

            if (userMarker) {
                map.removeLayer(userMarker);
            }

            if (userAccuracyCircle) {
                map.removeLayer(userAccuracyCircle);
            }

            userMarker = L.marker(
                userPosition,
                {
                    icon: userIcon
                }
            ).addTo(map);

            userMarker.bindPopup(
                "<strong>Você está aqui!</strong>"
            );

            userAccuracyCircle = L.circle(
                userPosition,
                {
                    radius: accuracy,
                    color: "#3b9cff",
                    fillColor: "#3b9cff",
                    fillOpacity: 0.10
                }
            ).addTo(map);

            map.setView(userPosition, 16);

            userMarker.openPopup();

            mapStatus.textContent =
                "Localização encontrada!";

        },

        error => {

            console.error("Erro no GPS:", error);

            let message =
                "Não foi possível encontrar sua localização.";

            if (error.code === 1) {
                message = "Permita o acesso à localização.";
            }

            if (error.code === 2) {
                message = "Localização indisponível.";
            }

            if (error.code === 3) {
                message = "Tempo esgotado. Tente novamente.";
            }

            mapStatus.textContent = message;

            showNotification(message);

        },

        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        }

    );

}

//botão gps

locationButton.addEventListener(
    "click",
    locateUser
);

//iniciar

loadBusStops();
