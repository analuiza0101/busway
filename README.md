# Busway

O **Busway** é um projeto acadêmico que tem como objetivo facilitar o acesso a informações sobre o transporte público de João Pessoa, Paraíba. A plataforma reúne um mapa interativo, consulta de linhas e paradas de ônibus e ferramentas para pesquisa de trajetos.

## Objetivo

Desenvolver uma plataforma que auxilie os usuários a visualizar informações do transporte público e encontrar alternativas para seus deslocamentos pela cidade.

## Funcionalidades

### Mapa interativo
- Visualização do mapa de João Pessoa.
- Exibição de pontos de ônibus e itinerários.
- Identificação da localização atual do usuário por GPS.
- Visualização das linhas e paradas disponíveis nos dados utilizados pelo projeto.

### Pesquisa de linhas
- Busca de linhas pelo número.
- Consulta dos itinerários cadastrados.
- Apresentação dos dois sentidos de uma linha.
- Visualização dos trajetos no mapa.

### Planejamento de viagem
- Pesquisa de endereço de origem e destino.
- Possibilidade de utilizar a localização atual como ponto de partida.
- Busca de paradas próximas à origem e ao destino.
- Consulta de linhas que atendem às regiões pesquisadas.

**Observação:** o planejamento de viagens ainda está em desenvolvimento. O cálculo completo de um trajeto envolvendo caminhada até a parada, deslocamento de ônibus e caminhada até o destino está em implementação. Portanto, o sistema ainda não oferece um planejamento multimodal completo.

### Tempo real

A página de tempo real apresenta uma simulação de acompanhamento dos ônibus no mapa.

- Exibição de veículos simulados.
- Representação visual dos deslocamentos.
- Consulta de linhas e paradas.
- Apresentação de estimativas simuladas de chegada.

**Importante:** os ônibus exibidos não representam veículos reais em circulação. Suas posições e estimativas de chegada são simuladas, pois o projeto ainda não possui integração com dados reais de GPS dos veículos.

## Tecnologias utilizadas

- **HTML5:** estrutura das páginas.
- **CSS3:** estilização e organização visual.
- **JavaScript:** funcionalidades e interações.
- **Leaflet:** criação dos mapas interativos.
- **OpenStreetMap:** dados cartográficos.
- **Nominatim:** pesquisa de endereços.
- **OSRM:** cálculo de trajetos.
- **GeoJSON:** representação de informações geográficas, como linhas e pontos.

## Estrutura do projeto

```text
busway/
├── css/
│   ├── rotas.css
│   ├── style.css
│   └── tempo-real.css
│
├── img/
│
├── js/
│   ├── main.js
│   ├── rotas.js
│   └── tempo-real.js
│
└── paginas/
    ├── home.html
    ├── rotas.html
    └── tempo-real.html
```

## Como executar

1. Clone ou faça o download deste repositório.
2. Abra a pasta do projeto em um editor de código.
3. Utilize uma extensão como o Live Server para executar o arquivo `busway/paginas/home.html`.
4. Permita o acesso à localização do dispositivo caso queira utilizar o GPS.

## Serviços e fontes utilizados

- [OpenStreetMap](https://www.openstreetmap.org/)
- [Leaflet](https://leafletjs.com/)
- [Nominatim](https://nominatim.org/)
- [OSRM](https://project-osrm.org/)

## Status do projeto

O Busway está em desenvolvimento. Atualmente, oferece funcionalidades de visualização de mapas, consulta de linhas e pesquisa de trajetos, mas algumas partes ainda estão incompletas.

O acompanhamento de ônibus em tempo real é uma simulação, e o planejamento de viagens ainda precisa evoluir para considerar de forma completa os deslocamentos a pé e de ônibus.
