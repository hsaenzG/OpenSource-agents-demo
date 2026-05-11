# 🎧 DJ Agent — Agente de IA desde cero

Un agente de IA que actúa como DJ y curador musical, construido con Python, [Strands Agents](https://github.com/strands-agents/sdk-python?trk=b4df06f7-1a05-4faf-a488-43ff27da389d&sc_channel=el) y [Ollama](https://ollama.com/). Todo open source, local y gratis.

Basado en el artículo: [Cómo crear un agente de IA desde cero — open source, local y gratis](https://builder.aws.com/content/3CM7pfa65G4sfLy1X1J0a3aIxPC/como-crear-un-agente-de-ia-desde-cero-open-source-local-y-gratis?trk=b4df06f7-1a05-4faf-a488-43ff27da389d&sc_channel=el)

## Requisitos

- macOS / Linux / Windows
- Python 3.10+
- [Ollama](https://ollama.com/) (para capas 1-4)
- AWS CLI configurado (para capas 5-6, usa Amazon Bedrock)
- (Opcional) Cuenta de [Spotify Developer](https://developer.spotify.com/dashboard) para las capas 5-6

## Guía paso a paso

### 1. Instalar Ollama

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh
```

### 2. Descargar el modelo

```bash
ollama pull llama3.1
```

### 3. Levantar el servidor

```bash
ollama serve
```

> Si instalaste la app de macOS, el servidor ya corre en segundo plano.

### 4. Crear el entorno Python

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install 'strands-agents[ollama]' spotipy python-dotenv streamlit
```

### 5. (Opcional) Configurar Spotify — para capas 5 y 6

Crea una app en [Spotify Developer Dashboard](https://developer.spotify.com/dashboard):

1. Click en **Create App**
2. Nombre: lo que quieras (ej: "DJ Agent")
3. Redirect URI: `http://127.0.0.1:8000/callback`
4. Marca **Web API**
5. Guarda el **Client ID** y **Client Secret**

Crea un archivo `.env` en la raíz del proyecto:

```env
SPOTIFY_CLIENT_ID=tu-client-id
SPOTIFY_CLIENT_SECRET=tu-client-secret
```

> La primera vez que ejecutes una capa con Spotify, se abrirá el navegador para autorizar la app. Después el token se cachea automáticamente.

> **Sin Spotify:** Las capas 5-6 funcionan sin Spotify usando la biblioteca local como fallback. Verás un aviso `⚠️ Spotify no disponible` pero el agente seguirá respondiendo.

## Las 6 capas

Cada archivo representa una capa incremental del agente:

| Archivo | Capa | Concepto nuevo |
|---|---|---|
| `capa1_agente_basico.py` | 1 — Solo habla | `Agent`, `OllamaModel` |
| `capa2_con_tools.py` | 2 — Búsqueda | `@tool`, tool calling |
| `capa3_multi_tools.py` | 3 — Multi-tools | Múltiples tools, agent loop |
| `capa4_memoria.py` | 4 — Memoria | `FileSessionManager` |
| `capa5_spotify.py` | 5 — API externa | `BedrockModel`, `spotipy`, reproducción |
| `capa6_multi_agente.py` | 6 — Multi-agente | Orquestador + sub-agentes como tools |
| `app.py` | 🎸 Frontend | Streamlit UI, estilo dev + rock |

```bash
# Capas básicas (Ollama local)
python capa1_agente_basico.py
python capa2_con_tools.py
python capa3_multi_tools.py
python capa4_memoria.py

# Capas avanzadas (Bedrock + Spotify)
python capa5_spotify.py
python capa6_multi_agente.py

# Frontend (Bedrock + Spotify + Streamlit)
streamlit run app.py
```

## Detalle de cada capa

### Capa 1 — Agente básico
Un modelo + un prompt. Sin herramientas. Solo responde con su conocimiento general.

### Capa 2 — Con herramientas
El agente puede buscar canciones en una biblioteca local JSON. Primer contacto con `@tool`.

### Capa 3 — Múltiples herramientas
Tres tools: buscar, analizar energía, calcular duración. El modelo decide solo qué llamar y en qué orden.

### Capa 4 — Memoria
`FileSessionManager` persiste conversaciones a disco. El agente recuerda tus gustos entre sesiones.

### Capa 5 — Spotify (API externa)
Conexión real con la API de Spotify via Amazon Bedrock (Nova Pro):
- Buscar canciones en el catálogo completo de Spotify
- Ver tus artistas y canciones más escuchados
- Obtener recomendaciones personalizadas
- Crear playlists directamente en tu cuenta
- Reproducir canciones o playlists al instante en tu dispositivo activo
- Conversación interactiva desde la consola

### Capa 6 — Multi-Agente con Orquestador
Un agente orquestador que delega a sub-agentes especializados:

```
         Usuario
            │
            ▼
    ┌───────────────────┐
    │   Orquestador     │  ← Decide a quién delegar
    │   tools: [        │
    │     dj_personal,  │
    │     dj_eventos,   │
    │     dj_emocional  │
    │   ]               │
    └───┬───────┬───────┘
        │       │       │
        ▼       ▼       ▼
    DJ Personal  DJ Eventos  DJ Emocional
```

El concepto clave: **los sub-agentes se exponen como `@tool` del orquestador**. El orquestador es un agente que usa otros agentes como herramientas — el modelo decide a cuál delegar basándose en el mensaje del usuario.

| DJ | Se activa cuando... |
|---|---|
| 🎵 DJ Personal | "recomiéndame algo", "qué hay nuevo de X" |
| 🎉 DJ de Eventos | "arma playlist de 3h para una fiesta" |
| 💜 DJ Emocional | "estoy triste", "me siento motivado" |

Los sub-agentes usan `callback_handler=None` para silenciar su output — solo el orquestador habla con el usuario.

## Frontend — Streamlit (app.py)

Una interfaz web moderna con estética **dev + rock** 🎸 que conecta con el agente DJ.

```bash
streamlit run app.py
```

Se abre en `http://localhost:8501`.

### Features

- **Tema oscuro** con gradientes negro/púrpura y acentos neón (rosa, verde, naranja)
- **Tipografía** JetBrains Mono + Space Grotesk con headers en gradiente
- **Chat interactivo** con el agente DJ — pide playlists, busca canciones, reproduce música
- **Now Playing** — widget en el sidebar que muestra en tiempo real la canción que está sonando en Spotify:
  - Carátula del álbum
  - Barras de ecualizador animadas
  - Nombre, artista y álbum
  - Barra de progreso con timestamps
  - Estado pausado / nada sonando
- **Quick prompts** — botones rápidos para arrancar: rock para programar, fiesta, chill, melancólico, máxima energía
- **System status** — indicadores de conexión del agente, Spotify y biblioteca local
- **Stats de la biblioteca** — breakdown de géneros y moods con barras ASCII

### Requisitos adicionales

- `pip install streamlit` (ya incluido en el paso 4)
- `pip install "botocore[crt]"` (necesario para credenciales de AWS)
- AWS CLI configurado con acceso a Amazon Bedrock
- (Opcional) Spotify configurado en `.env` para reproducción y búsqueda real

### Stack

| Componente | Tecnología |
|---|---|
| Frontend | Streamlit |
| Agente | Strands Agents |
| Modelo | Amazon Bedrock (Nova Pro) |
| Música | Spotify API (spotipy) |
| Estilo | CSS custom (dark theme) |

## Estructura del proyecto

```
.
├── README.md
├── .env                            # Credenciales de Spotify (no se sube a git)
├── app.py                          # 🎸 Frontend Streamlit (dev + rock)
├── data/
│   └── canciones.json              # Biblioteca musical local (30 canciones)
├── capa1_agente_basico.py          # Agente básico (Ollama)
├── capa2_con_tools.py              # Agente + búsqueda local
├── capa3_multi_tools.py            # Agente + múltiples herramientas
├── capa4_memoria.py                # Agente + memoria persistente
├── capa5_spotify.py                # Agente + Spotify (Bedrock)
├── capa6_multi_agente.py           # Multi-agente con orquestador
└── sesiones/                       # Sesiones guardadas (generado automáticamente)
```

## Recursos

- [Documentación de Strands Agents](https://strandsagents.com?trk=b4df06f7-1a05-4faf-a488-43ff27da389d&sc_channel=el)
- [Repo de Strands en GitHub](https://github.com/strands-agents/sdk-python?trk=b4df06f7-1a05-4faf-a488-43ff27da389d&sc_channel=el) — Apache 2.0
- [Community tools](https://github.com/strands-agents/tools?trk=b4df06f7-1a05-4faf-a488-43ff27da389d&sc_channel=el)
- [Ollama](https://ollama.com/)
- [Streamlit](https://streamlit.io/)
- [Spotipy — Python library for Spotify](https://spotipy.readthedocs.io/)
- [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
- [Amazon Bedrock](https://aws.amazon.com/bedrock/)
