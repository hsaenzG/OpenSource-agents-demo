# 🎸 DJ Agent — Web (Astro + TypeScript)

Versión web del DJ Agent usando **Astro** con rendering del lado del servidor (SSR) y **Strands Agents SDK** para el backend.

## Stack

- **Frontend**: Astro 5 + HTML/CSS/JS vanilla (dark dev + rock theme)
- **Backend**: Astro SSR con Node adapter + Strands Agents SDK
- **Modelo**: Amazon Bedrock (Nova Pro)
- **Tools**: Biblioteca local de canciones (buscar, analizar energía, duración)

## Setup

```bash
# Instalar dependencias
npm install

# Copiar variables de entorno
cp .env.example .env

# Ejecutar en modo desarrollo
npm run dev
```

## Variables de entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `AWS_REGION` | Región de AWS para Bedrock | `us-east-1` |
| `BEDROCK_MODEL_ID` | ID del modelo en Bedrock | `us.amazon.nova-pro-v1:0` |

> Asegurate de tener configuradas las credenciales de AWS (`~/.aws/credentials` o variables de entorno `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`).

## Estructura

```
web/
├── public/           # Assets estáticos
├── src/
│   ├── layouts/      # Layout base HTML
│   ├── lib/          # Lógica del agente y datos
│   │   ├── agent.ts      # Configuración del agente Strands
│   │   └── canciones.ts  # Carga de la biblioteca musical
│   └── pages/
│       ├── api/
│       │   ├── chat.ts       # POST /api/chat — endpoint del agente
│       │   └── biblioteca.ts # GET /api/biblioteca — stats
│       └── index.astro       # Página principal (chat UI)
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

## Features

- 🎨 Dark theme con estilo dev + rock (mismos colores que la versión Python)
- 💬 Chat interactivo con el agente DJ
- ⚡ Quick prompts en el sidebar
- 🛠️ Muestra las herramientas usadas por el agente
- 📊 Stats de la biblioteca en el sidebar
- 🎸 Animaciones CSS (equalizer, glow, fade-in)
