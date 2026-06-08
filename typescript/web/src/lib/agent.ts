/**
 * DJ Agent — Backend del agente usando Strands SDK + Bedrock
 */

import { Agent, tool, BeforeToolCallEvent } from "@strands-agents/sdk";
import z from "zod";
import { BIBLIOTECA } from "./canciones.js";

// ─── Tools ───────────────────────────────────────────────────────────────────

const buscarCanciones = tool({
  name: "buscar_canciones",
  description: "Busca canciones en la biblioteca musical del usuario por género, mood o artista.",
  inputSchema: z.object({
    genero: z.string().optional().describe("Género musical (ej: rock, jazz, reggaetón, electrónica)"),
    mood: z.string().optional().describe("Estado de ánimo (ej: chill, fiesta, melancólico, energético)"),
    artista: z.string().optional().describe("Nombre del artista o banda"),
  }),
  callback: (input) => {
    let resultados = BIBLIOTECA;
    if (input.genero) {
      resultados = resultados.filter((c) =>
        c.genero.toLowerCase().includes(input.genero!.toLowerCase())
      );
    }
    if (input.mood) {
      resultados = resultados.filter((c) =>
        c.mood.toLowerCase().includes(input.mood!.toLowerCase())
      );
    }
    if (input.artista) {
      resultados = resultados.filter((c) =>
        c.artista.toLowerCase().includes(input.artista!.toLowerCase())
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
  description: "Analiza el nivel de energía promedio de una lista de canciones y sugiere el orden ideal.",
  inputSchema: z.object({
    canciones: z.array(z.string()).describe("Lista de nombres de canciones a analizar"),
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
      2
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
      0
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
      2
    );
  },
});

// ─── Agent singleton ─────────────────────────────────────────────────────────

let agentInstance: Agent | null = null;

export function getAgent(): Agent {
  if (!agentInstance) {
    const systemPrompt = `Eres un DJ y curador musical experto con actitud rockera.
Usas emojis de rock (🎸🤘🔥🎵) en tus respuestas.
Usa tus herramientas para armar playlists basadas en la biblioteca local del usuario.
Considera el mood, la energía, y la duración para crear una experiencia coherente.
SIEMPRE usa tus herramientas antes de responder. NUNCA digas que no puedes hacer algo.
Respondes en español, con onda y personalidad.`;

    agentInstance = new Agent({
      model: {
        modelId: process.env.BEDROCK_MODEL_ID || "us.amazon.nova-pro-v1:0",
        region: process.env.AWS_REGION || "us-east-1",
      },
      systemPrompt,
      tools: [buscarCanciones, analizarEnergia, duracionPlaylist],
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
