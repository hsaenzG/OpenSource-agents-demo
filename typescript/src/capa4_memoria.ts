/**
 * Capa 4 — Memoria (Sesiones persistentes)
 *
 * Concepto nuevo: persistencia de conversaciones.
 * El agente recuerda los gustos del usuario entre mensajes y entre ejecuciones.
 * Usa el SessionManager nativo del SDK, que persiste la conversación en disco
 * (FileStorage) y la restaura al arrancar.
 *
 * Requisitos:
 *   - Ollama corriendo en localhost:11434
 *   - Modelo llama3.1 descargado
 */

import { createInterface } from "node:readline/promises";
import { Agent, tool, SessionManager, FileStorage } from "@strands-agents/sdk";
import { createModel } from "./create_model.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import z from "zod";
import { printPrompt, streamColored } from "./utils_color.js";

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

// ─── Tools ───────────────────────────────────────────────────────────────────

const buscarCanciones = tool({
  name: "buscar_canciones",
  description: `Busca canciones en la biblioteca musical del usuario.`,
  inputSchema: z.object({
    genero: z.string().optional().describe("Género musical"),
    mood: z.string().optional().describe("Estado de ánimo"),
    artista: z.string().optional().describe("Nombre del artista"),
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
    return JSON.stringify({
      energia_promedio: Math.round(promedio),
      flow:
        analisis[0].energia < analisis[analisis.length - 1].energia
          ? "ascendente"
          : "descendente",
      orden_sugerido: analisis.map((c) => c.titulo),
    }, null, 2);
  },
});

const duracionPlaylist = tool({
  name: "duracion_playlist",
  description: `Calcula la duración total de una playlist.`,
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
    return JSON.stringify({
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
    }, null, 2);
  },
});

// ─── Agente con memoria ──────────────────────────────────────────────────────

const modelo = createModel(); // proveedor y modelo vienen del .env

// SessionManager nativo del SDK: persiste la conversación completa en disco y la
// restaura al arrancar. El agente recupera su array de mensajes real (con roles),
// no un resumen pegado al system prompt. Guarda tras cada invoke por defecto.
const sessionManager = new SessionManager({
  sessionId: "usuario-1",
  storage: { snapshot: new FileStorage(resolve(__dirname, "../sesiones")) },
});

const dj = new Agent({
  model: modelo,
  systemPrompt: `Eres un DJ y curador musical experto.
Recuerdas los gustos del usuario entre conversaciones.
Si el usuario ya te dijo qué le gusta, úsalo para personalizar tus playlists.
Usa tus herramientas para buscar en la biblioteca real del usuario.`,
  tools: [buscarCanciones, analizarEnergia, duracionPlaylist],
  sessionManager,
  printer: false, // manejamos la salida a mano con streamColored
});

// ─── Loop interactivo — el agente recuerda entre mensajes y entre ejecuciones ─

const rl = createInterface({ input: process.stdin, output: process.stdout });

console.log('🎧 Habla con el DJ. Recuerda tus gustos entre mensajes. Escribe "salir" para terminar.');

while (true) {
  let prompt: string;
  try {
    prompt = (await rl.question("\n🎵 Tú: ")).trim();
  } catch (error: any) {
    // Ctrl+C (SIGINT) hace que readline aborte la pregunta. Salimos limpio.
    if (error?.code === "ABORT_ERR") break;
    throw error;
  }

  if (prompt === "") continue;
  if (prompt.toLowerCase() === "salir") break;

  printPrompt(prompt);
  await streamColored(dj, prompt);
  // No guardamos a mano: el SessionManager persiste la conversación tras cada invoke/stream.
}

console.log("\n👋 ¡Nos vemos! Tus gustos quedaron guardados.");
rl.close();
