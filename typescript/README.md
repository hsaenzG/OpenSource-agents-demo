# 🎧 DJ Agent — TypeScript Edition

Un agente de IA que actúa como DJ y curador musical, construido con TypeScript y el [Strands Agents SDK](https://github.com/strands-agents/sdk-typescript).

Hay dos formas de usarlo:

- **CLI (las 6 capas):** aprendé a construir un agente paso a paso, de lo más simple a un sistema multi-agente. Corre local con [Ollama](https://ollama.com/) o en la nube con Amazon Bedrock.
- **App web:** una interfaz tipo chat con reproductor de Spotify, playlists y streaming en vivo de lo que hace el agente.

Basado en el [proyecto original en Python](../README.md).

---

## Requisitos

- **Node.js 20+**
- Para correr local: [Ollama](https://ollama.com/)
- Para usar Bedrock o la app web: **AWS CLI configurado** con acceso a Amazon Bedrock
- (Opcional) Cuenta de [Spotify Developer](https://developer.spotify.com/dashboard)

---

## Parte 1 — CLI (las 6 capas)

### 1. Instalar dependencias

```bash
cd typescript
npm install
```

### 2. Configurar el `.env`

```bash
cp .env.example .env
```

Elige con qué modelo corren **todas** las capas:

```env
# Opción A — Local y gratis (default)
MODEL_PROVIDER=ollama
MODEL_ID=llama3.1:8b

# Opción B — Amazon Bedrock (requiere AWS CLI configurado)
# MODEL_PROVIDER=bedrock
# BEDROCK_MODEL_ID=us.amazon.nova-pro-v1:0
# AWS_REGION=us-east-1
```

### 3. Si usas Ollama (opción A)

```bash
ollama pull llama3.1:8b   # descarga el modelo
ollama serve              # levanta el servidor (la app de macOS ya lo corre solo)
```

### 4. Correr una capa

```bash
npm run capa1   # ... hasta npm run capa6
```

> Las capas 5 y 6 usan Spotify. Si no configuraste Spotify, igual corren usando la biblioteca local (`data/canciones.json`).

---

## Parte 2 — App web

Interfaz visual del DJ Agent: chat, reproductor de Spotify, creación de playlists y feed en vivo de las herramientas que usa el agente.

> La app web usa **Amazon Bedrock**, así que necesitas AWS configurado.

### 1. Instalar y configurar

```bash
cd typescript/web
npm install
cp .env.example .env
```

Edita `web/.env`:

```env
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=us.amazon.nova-pro-v1:0
SPOTIFY_CLIENT_ID=tu-client-id
SPOTIFY_CLIENT_SECRET=tu-client-secret
```

### 2. Levantar el servidor

```bash
aws login       # asegúrate de tener credenciales AWS activas
npm run dev
```

Abre **`http://127.0.0.1:4321`** (usa `127.0.0.1`, no `localhost` — ver nota de Spotify abajo).

### 3. Conectar Spotify

En la barra lateral, click en **🔗 Conectar mi Spotify**. Autorizas una vez en el navegador y listo: el agente puede buscar, crear playlists y controlar la reproducción.

- Controlar la reproducción (play/pausa/next) requiere **Spotify Premium** y tener Spotify abierto en algún dispositivo.
- El token se guarda y se refresca solo. Si expira, vuelve a aparecer el botón de conectar.

---

## Configurar Spotify (opcional)

Crea una app en el [Spotify Developer Dashboard](https://developer.spotify.com/dashboard):

1. **Create App** → ponle cualquier nombre.
2. Marca **Web API**.
3. Agrega los **Redirect URIs** (según lo que vayas a usar):
   - CLI: `http://127.0.0.1:8000/callback`
   - Web: `http://127.0.0.1:4321/api/spotify/callback`
4. Copia el **Client ID** y **Client Secret** a tu `.env`.

> ⚠️ Spotify ya no acepta `localhost`, tiene que ser `127.0.0.1`. Por eso abre la web en `http://127.0.0.1:4321`.

---

## Las 6 capas (CLI)

Cada archivo agrega un concepto nuevo, de simple a complejo:

| Archivo | Capa | Concepto nuevo |
|---|---|---|
| `src/capa1_agente_basico.ts` | 1 — Solo habla | `Agent` + modelo (Ollama o Bedrock) |
| `src/capa2_con_tools.ts` | 2 — Búsqueda | `tool()` + schemas Zod |
| `src/capa3_multi_tools.ts` | 3 — Multi-tools | Varias tools, el agente decide cuál usar |
| `src/capa4_memoria.ts` | 4 — Memoria | `SessionManager` nativo (persiste en disco) |
| `src/capa5_spotify.ts` | 5 — API externa | Cliente Spotify nativo (fetch) |
| `src/capa6_multi_agente.ts` | 6 — Multi-agente | Orquestador + sub-agentes con `asTool()` |

### Capa 6 — Multi-agente en corto

```
    Usuario → Orquestador → decide a quién delegar
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
   DJ Personal  DJ Eventos  DJ Emocional
```

El truco: cada sub-agente se expone como una `tool()` del orquestador con `agente.asTool()`. Un agente que usa otros agentes como herramientas.

---

## Cómo se conecta cada pieza

- **`src/create_model.ts`** — factory que elige Ollama o Bedrock según `MODEL_PROVIDER`. Un solo punto para todas las capas.
- **`src/ollama_model.ts`** — wrapper de Ollama (sobre `ai-sdk-ollama`) que corrige eventos del stream que el SDK espera.
- **`src/spotify_client.ts`** — cliente de Spotify con `fetch` nativo: auth, refresh de token y reintento ante 401. Sin librerías.
- **`src/spotify_auth.ts`** — flujo OAuth del CLI (abre el navegador, cachea el token).
- **`web/`** — la app Astro. El OAuth vive en `web/src/pages/api/spotify/*` y el agente en `web/src/lib/agent.ts`.

---

## Diferencias con la versión Python

| Aspecto | Python | TypeScript |
|---|---|---|
| SDK | `strands-agents` | `@strands-agents/sdk` |
| Modelo local | `OllamaModel` nativo | `OllamaModel` sobre `ai-sdk-ollama` |
| Selección de modelo | por código | `MODEL_PROVIDER` en `.env` |
| Tools | `@tool` + docstrings | `tool()` + Zod (runtime + estático) |
| Spotify | `spotipy` | `fetch` nativo (`spotify_client.ts`) |
| Sesiones | `FileSessionManager` | `SessionManager` + `FileStorage` del SDK |
| Ejecución | `python archivo.py` | `npm run capaN` |

---

## Estructura del proyecto

```
typescript/
├── .env / .env.example          # credenciales y selección de modelo (no subir .env)
├── package.json
├── data/canciones.json          # biblioteca musical local (30 canciones)
├── src/
│   ├── create_model.ts          # elige Ollama o Bedrock según .env
│   ├── ollama_model.ts          # wrapper de Ollama para el SDK
│   ├── spotify_client.ts        # cliente Spotify con fetch nativo
│   ├── spotify_auth.ts          # OAuth del CLI
│   ├── capa1_agente_basico.ts   # ... hasta capa6
│   └── utils_color.ts
├── sesiones/                    # sesiones guardadas (auto-generado)
└── web/                         # app web (Astro): chat, reproductor, playlists
    └── src/
        ├── lib/                 # agent.ts, spotify.ts, spotify_client.ts, spotify_auth.ts
        └── pages/
            ├── index.astro      # UI
            └── api/             # chat (SSE), playback, playlist, spotify/{login,callback,status}
```

---

## Recursos

- [Strands Agents TypeScript SDK](https://github.com/strands-agents/sdk-typescript)
- [Documentación de Strands Agents](https://strandsagents.com)
- [Ollama](https://ollama.com/) · [Amazon Bedrock](https://aws.amazon.com/bedrock/) · [Zod](https://zod.dev/)
- [Spotify Web API](https://developer.spotify.com/documentation/web-api) · [Astro](https://astro.build/)
