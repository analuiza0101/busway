
// ==========================================
// ELEMENTOS DA PÁGINA
// ==========================================

const routeForm = document.getElementById("routeForm");
const formMessage = document.getElementById("formMessage");
const useLocationButton = document.getElementById("useLocation");

const originInput = document.getElementById("origin");
const destinationInput = document.getElementById("destination");
const routeResults = document.getElementById("routeResults");

const lineSearch = document.getElementById("lineSearch");
const searchLineButton = document.getElementById("searchLineButton");
const lineResults = document.getElementById("lineResults");
const lineSearchMessage = document.getElementById("lineSearchMessage");


// ==========================================
// MAPA
// ==========================================

const mapa = L.map("routeMap").setView([-7.1195, -34.8450], 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap"
}).addTo(mapa);

// Deixa o mapa escuro
document.querySelector("#routeMap .leaflet-tile-pane").style.filter =
    "invert(100%) hue-rotate(180deg) brightness(85%) contrast(90%) saturate(65%)";


// ==========================================
// CAMADAS E VARIÁVEIS
// ==========================================

const camadaParadas = L.layerGroup().addTo(mapa);
const camadaProximas = L.layerGroup().addTo(mapa);

let camadaItinerarios = L.geoJSON(null, {
    style: {
        color: "#f3f303",
        weight: 4,
        opacity: 0.85
    },
    onEachFeature: function (feature, layer) {
        const dados = feature.properties || {};

        const codigo = dados.line_code || "Linha não identificada";
        const nome = dados.route_name || "Itinerário";
        const sentido = dados.direction_name || "Não informado";

        layer.bindPopup(`
            <strong>${escaparHTML(String(codigo))}</strong><br>
            ${escaparHTML(String(nome))}<br>
            Sentido: ${escaparHTML(String(sentido))}
        `);
    }
}).addTo(mapa);

let marcadorOrigem = null;
let marcadorDestino = null;
let linhaRota = null;

let todasParadas = [];
let todosItinerarios = [];
let coordenadaGPS = null;


// ==========================================
// FUNÇÃO PARA EVITAR HTML INDESEJADO
// ==========================================

function escaparHTML(valor) {
    return valor.replace(/[&<>"']/g, function (caractere) {
        const caracteres = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };

        return caracteres[caractere];
    });
}


// ==========================================
// DISTÂNCIA ENTRE DOIS PONTOS
// ==========================================

function calcularDistancia(lat1, lon1, lat2, lon2) {
    const raioTerra = 6371;

    const diferencaLat = (lat2 - lat1) * Math.PI / 180;
    const diferencaLon = (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(diferencaLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(diferencaLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return raioTerra * c;
}


// ==========================================
// CARREGAR PARADAS DE ÔNIBUS
// ==========================================

async function carregarParadas() {
    const endereco =
        "https://horarios.clickbuspb.com.br/dados/vetores/paradas.geojson";

    try {
        const resposta = await fetch(endereco);

        if (!resposta.ok) {
            throw new Error("Não foi possível carregar as paradas.");
        }

        const dados = await resposta.json();

        todasParadas = dados.features
            .filter(function (feature) {
                return (
                    feature.geometry &&
                    feature.geometry.type === "Point"
                );
            })
            .map(function (feature) {
                const propriedades = feature.properties || {};
                const coordenadas = feature.geometry.coordinates;

                return {
                    nome:
                        propriedades.stop_name ||
                        propriedades.short_name ||
                        "Parada de ônibus",

                    endereco: propriedades.address || "",

                    latitude: coordenadas[1],
                    longitude: coordenadas[0]
                };
            });

        todasParadas.forEach(function (parada) {
            L.circleMarker(
                [parada.latitude, parada.longitude],
                {
                    radius: 5,
                    color: "#36d17c",
                    fillColor: "#36d17c",
                    fillOpacity: 0.9,
                    weight: 1
                }
            )
                .bindPopup(`
                    <strong>${escaparHTML(parada.nome)}</strong><br>
                    ${escaparHTML(parada.endereco)}
                `)
                .addTo(camadaParadas);
        });

        console.log("Paradas carregadas:", todasParadas.length);

    } catch (erro) {
        console.error("Erro ao carregar paradas:", erro);
    }
}


// ==========================================
// CARREGAR ITINERÁRIOS DE ÔNIBUS
// ==========================================

async function carregarItinerarios() {
    const endereco =
        "https://horarios.clickbuspb.com.br/dados/vetores/itinerarios-originais.geojson";

    lineSearchMessage.textContent = "Carregando linhas de ônibus...";

    try {
        const resposta = await fetch(endereco);

        if (!resposta.ok) {
            throw new Error("Não foi possível carregar os itinerários.");
        }

        const dados = await resposta.json();

        todosItinerarios = dados.features || [];

        lineSearchMessage.textContent =
            todosItinerarios.length +
            " itinerários carregados. Digite o número ou nome de uma linha.";

        lineResults.innerHTML = `
            <div class="line-empty">
                Digite o número ou nome de uma linha para pesquisar.
            </div>
        `;

        console.log("Itinerários carregados:", todosItinerarios.length);

    } catch (erro) {
        console.error("Erro ao carregar itinerários:", erro);

        lineSearchMessage.textContent =
            "Não foi possível carregar os itinerários agora.";

        lineResults.innerHTML = `
            <div class="line-empty">
                O serviço de dados não respondeu.
                Tente atualizar a página mais tarde.
            </div>
        `;
    }
}


// ==========================================
// PESQUISAR LINHAS
// ==========================================


function pesquisarLinhas() {
    const pesquisa = lineSearch.value
        .trim()
        .toLowerCase();

    if (!pesquisa) {
        lineResults.innerHTML = `
            <div class="line-empty">
                Digite o número ou nome de uma linha.
            </div>
        `;
        return;
    }

    const encontrados = todosItinerarios.filter(function (feature) {
        const dados = feature.properties || {};

        const codigo = String(
            dados.line_code || ""
        ).trim().toLowerCase();

        const nome = String(
            dados.route_name || ""
        ).toLowerCase();

        if (/^\d+$/.test(pesquisa)) {
            return codigo === pesquisa;
        }

        return codigo.includes(pesquisa) ||
               nome.includes(pesquisa);
    });

    const grupos = new Map();

    encontrados.forEach(function (feature) {
        const dados = feature.properties || {};

        const codigo = String(
            dados.line_code ||
            dados.source_line_id ||
            "Sem código"
        ).trim();

        if (!grupos.has(codigo)) {
            grupos.set(codigo, {
                codigo: codigo,
                nome: dados.route_name || "Itinerário de ônibus",
                empresa: dados.operator_name || "Operadora não informada",
                sentidos: new Set(),
                features: []
            });
        }

        const grupo = grupos.get(codigo);

        const sentido =
            dados.direction_name ||
            dados.direction_code ||
            "Sentido não informado";

        grupo.sentidos.add(String(sentido));
        grupo.features.push(feature);
    });

    mostrarResultadosLinhas(
        Array.from(grupos.values())
    );
}

// ==========================================
// MOSTRAR RESULTADOS DA PESQUISA
// ==========================================

function mostrarResultadosLinhas(resultados) {
    lineResults.innerHTML = "";

    if (resultados.length === 0) {
        lineResults.innerHTML = `
            <div class="line-empty">
                Nenhuma linha encontrada.
                Confira o número ou tente pesquisar pelo nome.
            </div>
        `;
        return;
    }

    lineSearchMessage.textContent =
        resultados.length + " linha(s) encontrada(s).";

    resultados.slice(0, 30).forEach(function (grupo) {
        const cartao = document.createElement("button");

        cartao.type = "button";
        cartao.className = "line-card";

        const sentidosHTML = Array.from(grupo.sentidos)
            .map(function (sentido) {
                return `<span>• ${escaparHTML(sentido)}</span>`;
            })
            .join("");

        cartao.innerHTML = `
            <strong>${escaparHTML(grupo.codigo)}</strong>
            <span>${escaparHTML(String(grupo.nome))}</span>
            <span><strong>Sentidos:</strong></span>
            ${sentidosHTML}
            <span>Operadora: ${escaparHTML(String(grupo.empresa))}</span>
            <span class="line-status">Traçado de referência</span>
        `;

        cartao.addEventListener("click", function () {
            mostrarItinerario(grupo.features[0]);
        });

        lineResults.appendChild(cartao);
    });
}

// ==========================================
// MOSTRAR ITINERÁRIO NO MAPA
// ==========================================

function mostrarItinerario(feature) {
    camadaItinerarios.clearLayers();

    camadaProximas.clearLayers();

    camadaItinerarios.addData(feature);

    const limites = camadaItinerarios.getBounds();

    if (limites.isValid()) {
        mapa.fitBounds(limites, {
            padding: [35, 35],
            maxZoom: 15
        });
    }

    const dados = feature.properties || {};

    const codigo = dados.line_code || "Linha";
    const nome = dados.route_name || "Itinerário";

    lineSearchMessage.textContent =
        "Itinerário selecionado: " + codigo + " — " + nome;
}

// ==========================================
// PESQUISAR ENDEREÇO
// ==========================================

async function pesquisarEndereco(endereco) {
    const consulta =
        encodeURIComponent(endereco + ", João Pessoa, Paraíba, Brasil");

    const url =
        "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=" +
        consulta;

    const resposta = await fetch(url);

    if (!resposta.ok) {
        throw new Error("Erro ao pesquisar endereço.");
    }

    const dados = await resposta.json();

    if (!dados.length) {
        throw new Error("Endereço não encontrado.");
    }

    return {
        lat: Number(dados[0].lat),
        lng: Number(dados[0].lon),
        nome: dados[0].display_name
    };
}


// ==========================================
// CALCULAR CAMINHO PELAS RUAS
// ==========================================

async function calcularCaminho(origem, destino) {
    const coordenadas =
        origem.lng + "," + origem.lat + ";" +
        destino.lng + "," + destino.lat;

    const url =
        "https://router.project-osrm.org/route/v1/driving/" +
        coordenadas +
        "?overview=full&geometries=geojson";

    const resposta = await fetch(url);

    if (!resposta.ok) {
        throw new Error("Não foi possível calcular o caminho.");
    }

    const dados = await resposta.json();

    if (!dados.routes || !dados.routes.length) {
        throw new Error("Nenhum caminho encontrado.");
    }

    return dados.routes[0];
}


// ==========================================
// DESENHAR CAMINHO NO MAPA
// ==========================================

function desenharCaminho(caminho) {
    if (linhaRota) {
        mapa.removeLayer(linhaRota);
    }

    linhaRota = L.geoJSON(caminho.geometry, {
        style: {
            color: "#2563EB",
            weight: 5,
            opacity: 0.9
        }
    }).addTo(mapa);
}


// ==========================================
// MOSTRAR MARCADORES DE ORIGEM E DESTINO
// ==========================================

function mostrarMarcadores(origem, destino) {
    if (marcadorOrigem) {
        mapa.removeLayer(marcadorOrigem);
    }

    if (marcadorDestino) {
        mapa.removeLayer(marcadorDestino);
    }

    const iconeAzul = L.divIcon({
        className: "custom-marker",
        html: '<div style="background: #2563EB; width: 16px; height: 16px; border: 2px solid white; border-radius: 50%;"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    marcadorOrigem = L.marker([origem.lat, origem.lng], {
        icon: iconeAzul
    })
        .addTo(mapa)
        .bindPopup("<strong>Ponto de partida</strong>");

    marcadorDestino = L.marker([destino.lat, destino.lng], {
        icon: iconeAzul
    })
        .addTo(mapa)
        .bindPopup("<strong>Destino</strong>");
}

// ==========================================
// BUSCAR TRAJETO
// ==========================================

routeForm.addEventListener("submit", async function (evento) {
    evento.preventDefault();

    const origemTexto = originInput.value.trim();
    const destinoTexto = destinationInput.value.trim();

    if (!destinoTexto) {
        formMessage.textContent = "Informe um destino.";
        return;
    }

    formMessage.textContent = "Calculando seu caminho...";

    try {
        let origem;

        if (
            origemTexto.toLowerCase().includes("localização") &&
            coordenadaGPS
        ) {
            origem = coordenadaGPS;
        } else if (origemTexto) {
            origem = await pesquisarEndereco(origemTexto);
        } else if (coordenadaGPS) {
            origem = coordenadaGPS;
        } else {
            throw new Error(
                "Informe um ponto de partida ou use sua localização."
            );
        }

        const destino = await pesquisarEndereco(destinoTexto);

        const caminho = await calcularCaminho(origem, destino);

        desenharCaminho(caminho);
        mostrarMarcadores(origem, destino);

        mapa.fitBounds(linhaRota.getBounds(), {
            padding: [35, 35]
        });

        const distanciaKm = (caminho.distance / 1000).toFixed(1);
        const duracaoMinutos = Math.round(caminho.duration / 60);

        formMessage.textContent =
            "Caminho encontrado: " +
            distanciaKm +
            " km. Tempo estimado de carro: " +
            duracaoMinutos +
            " minutos.";

    } catch (erro) {
        formMessage.textContent = erro.message;
        console.error(erro);
    }
});


// ==========================================
// USAR LOCALIZAÇÃO DO CELULAR OU COMPUTADOR
// ==========================================

useLocationButton.addEventListener("click", function () {
    if (!navigator.geolocation) {
        formMessage.textContent =
            "Seu navegador não permite acessar a localização.";
        return;
    }

    formMessage.textContent = "Obtendo sua localização...";

    navigator.geolocation.getCurrentPosition(
        function (posicao) {
            coordenadaGPS = {
                lat: posicao.coords.latitude,
                lng: posicao.coords.longitude
            };

            originInput.value = "Minha localização";

            if (marcadorOrigem) {
                mapa.removeLayer(marcadorOrigem);
            }

            marcadorOrigem = L.marker([
                coordenadaGPS.lat,
                coordenadaGPS.lng
            ])
                .addTo(mapa)
                .bindPopup("<strong>Minha localização</strong>")
                .openPopup();

            mapa.setView([
                coordenadaGPS.lat,
                coordenadaGPS.lng
            ], 16);

            formMessage.textContent =
                "Localização encontrada! Agora informe seu destino.";
        },

        function () {
            formMessage.textContent =
                "Não foi possível obter sua localização. Verifique a permissão do navegador.";
        }
    );
});


// ==========================================
// EVENTOS DA PESQUISA DE LINHAS
// ==========================================

searchLineButton.addEventListener("click", pesquisarLinhas);

lineSearch.addEventListener("keydown", function (evento) {
    if (evento.key === "Enter") {
        evento.preventDefault();
        pesquisarLinhas();
    }
});


// ==========================================
// INICIALIZAÇÃO
// ==========================================

carregarParadas();
carregarItinerarios();

setTimeout(function () {
    mapa.invalidateSize();
}, 500);
