/**
 * Capa 3 — Múltiples Herramientas
 *
 * Concepto nuevo: múltiples tools + agent loop.
 * El modelo decide solo qué herramienta llamar y en qué orden.
 *
 * Tools: buscar_canciones, analizar_energia, duracion_playlist
 *
 * Requisitos:
 *   - Ollama corriendo en localhost:11434
 *   - Modelo llama3.1 descargado
 */

import { Agent, tool, configureLogging } from "@strands-agents/sdk";
import { createModel } from "./create_model.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import z from "zod";
import { printPrompt, printAgentPrefix, printAgentEnd, registerColorHooks } from "./utils_color.js";

// Suprimir warnings del SDK (finish_reason undefined de Ollama)
configureLogging({ debug: () => {}, info: () => {}, warn: () => {}, error: console.error });

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Cancion {
  titulo: string;
  artista: string;
  genero: string;
  mood: string;
  energia: number;
  duracion_min: number;
}

const BIBLIOTECA: Cancion[] = JSON.parse(
  readFileSync(resolve(__dirname, "../data/canciones.json"), "utf-8")
);

// ─── Tool: Buscar Canciones ──────────────────────────────────────────────────

const buscarCanciones = tool({
  name: "buscar_canciones",
  description: `Busca canciones en la biblioteca musical del usuario.
Filtra por género, mood o artista.`,
  inputSchema: z.object({
    genero: z
      .string()
      .optional()
      .describe("Género musical (ej: rock, jazz, reggaetón, electrónica)"),
    mood: z
      .string()
      .optional()
      .describe("Estado de ánimo o energía (ej: chill, fiesta, melancólico, energético)"),
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

// ─── Tool: Analizar Energía ──────────────────────────────────────────────────

const analizarEnergia = tool({
  name: "analizar_energia",
  description: `Analiza el nivel de energía promedio de una lista de canciones y sugiere el orden ideal.`,
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

// ─── Tool: Duración Playlist ─────────────────────────────────────────────────

const duracionPlaylist = tool({
  name: "duracion_playlist",
  description: `Calcula la duración total de una playlist y sugiere si necesita más canciones.`,
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

// ─── Agente ──────────────────────────────────────────────────────────────────

const modelo = createModel(); // proveedor y modelo vienen del .env

const dj = new Agent({
  model: modelo,
  systemPrompt: `Eres un DJ y curador musical experto.
Usa tus herramientas para armar playlists basadas en la biblioteca real del usuario.
Considera el mood, la energía, y la duración para crear una experiencia coherente.`,
  tools: [buscarCanciones, analizarEnergia, duracionPlaylist],
});
await registerColorHooks(dj);

const prompt = "Armame una playlist de una hora para una fiesta en casa";
printPrompt(prompt);
printAgentPrefix();
await dj.invoke(prompt);
printAgentEnd();
