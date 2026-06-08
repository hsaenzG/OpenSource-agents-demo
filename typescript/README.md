# 🎧 DJ Agent — TypeScript Edition

Un agente de IA que actúa como DJ y curador musical, construido con TypeScript, [Strands Agents SDK](https://github.com/strands-agents/sdk-typescript) y [Ollama](https://ollama.com/). Todo open source, local y gratis.

Basado en el [proyecto original en Python](../README.md).

## Requisitos

- Node.js 20+
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

### 4. Instalar dependencias

```bash
cd typescript
npm install
```

### 5. (Opcional) Configurar Spotify — para capas 5 y 6

Crea una app en [Spotify Developer Dashboard](https://developer.spotify.com/dashboard):

1. Click en **Create App**
2. Nombre: lo que quieras (ej: "DJ Agent")
3. Redirect URI: `http://127.0.0.1:8000/callback`
4. Marca **Web API**
5. Guarda el **Client ID** y **Client Secret**

Crea un archivo `.env` en la carpeta `typescript/`:

```env
SPOTIFY_CLIENT_ID=tu-client-id
SPOTIFY_CLIENT_SECRET=tu-client-secret
```

## Las 6 capas

Cada archivo representa una capa incremental del agente:

| Archivo | Capa | Concepto nuevo |
|---|---|---|
| `src/capa1_agente_basico.ts` | 1 — Solo habla | `Agent`, `VercelModel` + Ollama |
| `src/capa2_con_tools.ts` | 2 — Búsqueda | `tool()`, tool calling con Zod |
| `src/capa3_multi_tools.ts` | 3 — Multi-tools | Múltiples tools, agent loop |
| `src/capa4_memoria.ts` | 4 — Memoria | Sesiones persistentes en JSON |
| `src/capa5_spotify.ts` | 5 — API externa | `BedrockModel`, Spotify API |
| `src/capa6_multi_agente.ts` | 6 — Multi-agente | Orquestador + sub-agentes como tools |

```bash
# Capas básicas (Ollama local)
npm run capa1
npm run capa2
npm run capa3
npm run capa4

# Capas avanzadas (Bedrock + Spotify)
npm run capa5
npm run capa6
```

O directamente con tsx:

```bash
npx tsx src/capa1_agente_basico.ts
npx tsx src/capa2_con_tools.ts
# ...
```

## Detalle de cada capa

### Capa 1 — Agente básico
Un modelo + un prompt. Sin herramientas. Solo responde con su conocimiento general.
Usa `VercelModel` con `ai-sdk-ollama` para conectar con Ollama local.

### Capa 2 — Con herramientas
El agente puede buscar canciones en una biblioteca local JSON. Primer contacto con `tool()` y schemas Zod.

### Capa 3 — Múltiples herramientas
Tres tools: buscar, analizar energía, calcular duración. El modelo decide solo qué llamar y en qué orden.

### Capa 4 — Memoria
Un `FileSessionManager` custom persiste conversaciones a disco como JSON. El agente recuerda gustos entre sesiones.

### Capa 5 — Spotify (API externa)
Conexión real con la API de Spotify via Amazon Bedrock (Nova Pro):
- Buscar canciones en el catálogo completo de Spotify
- Proponer playlists con URIs reales
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

El concepto clave: **los sub-agentes se exponen como `tool()` del orquestador**. El orquestador es un agente que usa otros agentes como herramientas.

| DJ | Se activa cuando... |
|---|---|
| 🎵 DJ Personal | "recomiéndame algo", "qué hay nuevo de X" |
| 🎉 DJ de Eventos | "arma playlist de 3h para una fiesta" |
| 💜 DJ Emocional | "estoy triste", "me siento motivado" |

Los sub-agentes usan `printer: false` para silenciar su output — solo el orquestador habla con el usuario.

## Diferencias con la versión Python

| Aspecto | Python | TypeScript |
|---|---|---|
| SDK | `strands-agents[ollama]` | `@strands-agents/sdk` |
| Ollama | `OllamaModel` nativo | `VercelModel` + `ai-sdk-ollama` |
| Tool definition | `@tool` decorator + docstrings | `tool()` función + Zod schemas |
| Validación | Type hints | Zod schemas (runtime + static) |
| Spotify | `spotipy` | `spotify-web-api-node` |
| Sesiones | `FileSessionManager` (built-in) | Custom `FileSessionManager` |
| Ejecución | `python archivo.py` | `npx tsx src/archivo.ts` |

## Estructura del proyecto

```
typescript/
├── README.md
├── .env                            # Credenciales de Spotify (no subir a git)
├── .env.example                    # Template de .env
├── .gitignore
├── package.json
├── tsconfig.json
├── data/
│   └── canciones.json              # Biblioteca musical local (30 canciones)
├── src/
│   ├── utils_color.ts              # Utilidades de color para terminal
│   ├── capa1_agente_basico.ts      # Agente básico (Ollama)
│   ├── capa2_con_tools.ts          # Agente + búsqueda local
│   ├── capa3_multi_tools.ts        # Agente + múltiples herramientas
│   ├── capa4_memoria.ts            # Agente + memoria persistente
│   ├── capa5_spotify.ts            # Agente + Spotify (Bedrock)
│   └── capa6_multi_agente.ts       # Multi-agente con orquestador
└── sesiones/                       # Sesiones guardadas (auto-generado)
```

## Recursos

- [Strands Agents TypeScript SDK](https://github.com/strands-agents/sdk-typescript)
- [Documentación de Strands Agents](https://strandsagents.com)
- [TypeScript Quickstart](https://strandsagents.com/docs/user-guide/quickstart/typescript/)
- [Ollama](https://ollama.com/)
- [spotify-web-api-node](https://github.com/thelinmichael/spotify-web-api-node)
- [Amazon Bedrock](https://aws.amazon.com/bedrock/)
- [Zod](https://zod.dev/) — validación de schemas
