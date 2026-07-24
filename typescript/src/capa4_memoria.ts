/**
 * Capa 4 — Memoria (Sesiones persistentes)
 *
 * Concepto nuevo: persistencia de conversaciones.
 * El agente recuerda los gustos del usuario entre mensajes.
 * Las sesiones se guardan en disco como archivos JSON.
 *
 * Requisitos:
 *   - Ollama corriendo en localhost:11434
 *   - Modelo llama3.1 descargado
 */

import { Agent, tool, configureLogging } from "@strands-agents/sdk";
import { createModel } from "./create_model.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import z from "zod";
import { GREEN, MAGENTA, RESET, printPrompt, printAgentPrefix, printAgentEnd, registerColorHooks } from "./utils_color.js";

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

// ─── Session Manager simple (archivo JSON) ───────────────────────────────────

interface Message {
  role: string;
  content: string;
}

class FileSessionManager {
  private sessionPath: string;
  private messages: Message[] = [];

  constructor(sessionId: string, storageDir: string = "./sesiones") {
    const baseDir = resolve(__dirname, "..", storageDir);
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true });
    }
    this.sessionPath = resolve(baseDir, `session_${sessionId}.json`);
    this.load();
  }

  private load(): void {
    if (existsSync(this.sessionPath)) {
      const data = readFileSync(this.sessionPath, "utf-8");
      this.messages = JSON.parse(data);
    }
  }

  save(): void {
    writeFileSync(this.sessionPath, JSON.stringify(this.messages, null, 2));
  }

  addMessage(role: string, content: string): void {
    this.messages.push({ role, content });
    this.save();
  }

  getMessages(): Message[] {
    return this.messages;
  }

  getContextSummary(): string {
    if (this.messages.length === 0) return "";
    const lastMessages = this.messages.slice(-10);
    return lastMessages.map((m) => `${m.role}: ${m.content}`).join("\n");
  }
}

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

const sessionManager = new FileSessionManager("usuario-1");

const modelo = createModel(); // proveedor y modelo vienen del .env

// Construir system prompt con contexto de la sesión
const historialPrevio = sessionManager.getContextSummary();
const contextoPrevio = historialPrevio
  ? `\n\nHistorial previo de conversación con este usuario:\n${historialPrevio}`
  : "";

const dj = new Agent({
  model: modelo,
  systemPrompt: `Eres un DJ y curador musical experto.
Recuerdas los gustos del usuario entre conversaciones.
Si el usuario ya te dijo qué le gusta, úsalo para personalizar tus playlists.
Usa tus herramientas para buscar en la biblioteca real del usuario.${contextoPrevio}`,
  tools: [buscarCanciones, analizarEnergia, duracionPlaylist],
});
await registerColorHooks(dj);

// ─── Primera conversación ────────────────────────────────────────────────────

const prompt1 = "Me encanta el indie rock y el rock en español y rock clásico.";
printPrompt(prompt1);
printAgentPrefix();
const result1 = await dj.invoke(prompt1);
printAgentEnd();

sessionManager.addMessage("user", prompt1);
sessionManager.addMessage("assistant", String(result1.lastMessage ?? ""));

console.log();

// ─── Segunda conversación — el agente debería recordar los gustos ────────────

const prompt2 = "Armame algo para el viernes";
printPrompt(prompt2);
printAgentPrefix();
const result2 = await dj.invoke(prompt2);
printAgentEnd();

sessionManager.addMessage("user", prompt2);
sessionManager.addMessage("assistant", String(result2.lastMessage ?? ""));
