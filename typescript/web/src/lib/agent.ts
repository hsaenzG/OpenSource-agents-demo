/**
 * DJ Agent — Backend del agente usando Strands SDK + Bedrock + Spotify
 */

import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __agentDir = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__agentDir, "../../.env") }); // Cargar .env del web root

import {
  Agent,
  tool,
  BeforeToolCallEvent,
  BedrockModel,
} from "@strands-agents/sdk";
import z from "zod";
import { BIBLIOTECA } from "./canciones.js";
import {
  initSpotify,
  buscarEnSpotify,
  reproducirCancion,
  crearPlaylistEnSpotify,
  misTopArtistas,
  misTopCanciones,
} from "./spotify.js";

// ─── Tools ───────────────────────────────────────────────────────────────────

const buscarCanciones = tool({
  name: "buscar_canciones",
  description:
    "Busca canciones en la biblioteca musical del usuario por género, mood o artista.",
  inputSchema: z.object({
    genero: z
      .string()
      .optional()
      .describe("Género musical (ej: rock, jazz, reggaetón, electrónica)"),
    mood: z
      .string()
      .optional()
      .describe("Estado de ánimo (ej: chill, fiesta, melancólico, energético)"),
    artista: z.string().optional().describe("Nombre del artista o banda"),
  }),
  callback: (input) => {
    let resultados = BIBLIOTECA;
    if (input.genero) {
      resultados = resultados.filter((c) =>
        c.genero.toLowerCase().includes(input.genero!.toLowerCase()),
      );
    }
    if (input.mood) {
      resultados = resultados.filter((c) =>
        c.mood.toLowerCase().includes(input.mood!.toLowerCase()),
      );
    }
    if (input.artista) {
      resultados = resultados.filter((c) =>
        c.artista.toLowerCase().includes(input.artista!.toLowerCase()),
      );
    }
    if (resultados.length === 0) {
      return "No encontré canciones con esos criterios en tu biblioteca.";
    }
    return JSON.stringify(resultados.slice(0, 10), null, 2);
  },
});

const analizarEnergia = tool({
  name: "analizar_energia",
  description:
    "Analiza el nivel de energía promedio de una lista de canciones y sugiere el orden ideal.",
  inputSchema: z.object({
    canciones: z
      .array(z.string())
      .describe("Lista de nombres de canciones a analizar"),
  }),
  callback: (input) => {
    const energiaMap: Record<string, number> = {};
    for (const cancion of BIBLIOTECA) {
      energiaMap[cancion.titulo.toLowerCase()] = cancion.energia ?? 50;
    }
    const analisis = input.canciones.map((titulo) => ({
      titulo,
      energia: energiaMap[titulo.toLowerCase()] ?? 50,
    }));
    analisis.sort((a, b) => a.energia - b.energia);
    const promedio =
      analisis.length > 0
        ? analisis.reduce((sum, c) => sum + c.energia, 0) / analisis.length
        : 0;
    return JSON.stringify(
      {
        energia_promedio: Math.round(promedio),
        flow:
          analisis[0].energia < analisis[analisis.length - 1].energia
            ? "ascendente"
            : "descendente",
        orden_sugerido: analisis.map((c) => c.titulo),
        nota:
          promedio < 60
            ? "Energía baja → alta para ir subiendo el mood"
            : "Playlist con buena energía 🔥",
      },
      null,
      2,
    );
  },
});

const duracionPlaylist = tool({
  name: "duracion_playlist",
  description: "Calcula la duración total de una playlist.",
  inputSchema: z.object({
    canciones: z.array(z.string()).describe("Lista de nombres de canciones"),
  }),
  callback: (input) => {
    const duracionMap: Record<string, number> = {};
    for (const cancion of BIBLIOTECA) {
      duracionMap[cancion.titulo.toLowerCase()] = cancion.duracion_min ?? 3.5;
    }
    const total = input.canciones.reduce(
      (sum, t) => sum + (duracionMap[t.toLowerCase()] ?? 3.5),
      0,
    );
    return JSON.stringify(
      {
        canciones: input.canciones.length,
        duracion_total_min: Math.round(total * 10) / 10,
        duracion_formato:
          total >= 60
            ? `${Math.floor(total / 60)}h ${Math.floor(total % 60)}min`
            : `${Math.floor(total)}min`,
        sugerencia:
          total < 30
            ? "Playlist corta, podrías agregar más canciones"
            : "Buena duración 🎶",
      },
      null,
      2,
    );
  },
});

// ─── Agent singleton ─────────────────────────────────────────────────────────

let agentInstance: Agent | null = null;
let spotifyInitialized = false;

export async function getAgent(): Promise<Agent> {
  if (!agentInstance) {
    // Inicializar Spotify
    if (!spotifyInitialized) {
      const connected = await initSpotify();
      spotifyInitialized = true;
      if (connected) {
        console.log("✅ Spotify conectado en web agent");
      }
    }

    const systemPrompt = `Eres un DJ personal que opera Spotify REAL a través de herramientas.
NO eres un chatbot que responde de memoria. Tus únicas fuentes de datos musicales
son las herramientas: si no llamaste una herramienta, NO tienes datos válidos.

🔴 REGLA DE ORO
NUNCA escribas una lista de canciones sacada de tu conocimiento. Toda canción que
menciones DEBE venir del resultado de buscar_en_spotify. Está PROHIBIDO responder
algo como "1. Bohemian Rhapsody - Queen, 2. Stairway to Heaven..." de memoria.

FLUJOS OBLIGATORIOS (seguílos al pie de la letra):
- "Crea / arma / genera una playlist de X":
    PASO 1 → buscar_en_spotify (una o varias búsquedas por género/subgénero).
    PASO 2 → crear_playlist_en_spotify usando las URIs REALES que devolvió el paso 1.
    PASO 3 → comparte el link que devolvió crear_playlist_en_spotify.
    Nunca saltes el paso 1 ni el 2. Nunca inventes la lista.
- "Reproduce / pon / ponme X" → reproducir_cancion INMEDIATAMENTE.
- "Busca / recomiéndame música" → buscar_en_spotify PRIMERO.
- Preguntas sobre gustos del usuario → mis_top_artistas / mis_top_canciones.
- Análisis de biblioteca local (mood, energía, duración) → buscar_canciones,
  analizar_energia, duracion_playlist.

⛔ PROHIBIDO
- Responder sobre canciones sin haber llamado buscar_en_spotify.
- Escribir listas numeradas de canciones inventadas.
- Decir "no puedo" o pedirle al usuario que lo haga manual. TÚ lo haces con las tools.

Después de usar las herramientas, respondé breve y con onda rockera. 🎸🤘`;

    agentInstance = new Agent({
      model: new BedrockModel({
        modelId: process.env.BEDROCK_MODEL_ID || "us.amazon.nova-pro-v1:0",
        region: process.env.AWS_REGION || "us-east-1",
        temperature: 0.4,
      }),
      systemPrompt,
      tools: [
        buscarEnSpotify,
        reproducirCancion,
        crearPlaylistEnSpotify,
        misTopArtistas,
        misTopCanciones,
        buscarCanciones,
        analizarEnergia,
        duracionPlaylist,
      ],
      printer: false,
    });
  }
  return agentInstance;
}

/**
 * Registra hooks para rastrear qué herramientas usa el agente.
 * Retorna un Set que se llena con los nombres de tools usados durante la invocación.
 */
export function registerToolTracking(agent: Agent): Set<string> {
  const toolsUsed = new Set<string>();

  const agentAny = agent as any;
  if (!agentAny._trackingRegistered) {
    agentAny._toolsUsedRef = toolsUsed;
    agentAny._trackingRegistered = true;

    agent.addHook(BeforeToolCallEvent, (event: any) => {
      const toolName = event?.toolUse?.name;
      if (toolName && agentAny._toolsUsedRef) {
        agentAny._toolsUsedRef.add(toolName);
      }
    });
  } else {
    agentAny._toolsUsedRef = toolsUsed;
  }

  return toolsUsed;
}
