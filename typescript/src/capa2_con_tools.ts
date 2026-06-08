/**
 * Capa 2 — Con Herramientas (Tool Calling)
 *
 * Concepto nuevo: @tool — el agente puede buscar canciones en una biblioteca local JSON.
 *
 * Requisitos:
 *   - Ollama corriendo en localhost:11434
 *   - Modelo llama3.1 descargado
 */

import { Agent, tool, configureLogging } from "@strands-agents/sdk";
import { OllamaModel } from "./ollama_model.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import z from "zod";
import { printPrompt, printAgentPrefix, printAgentEnd, registerColorHooks } from "./utils_color.js";

// Suprimir warnings del SDK (finish_reason undefined de Ollama)
configureLogging({ debug: () => {}, info: () => {}, warn: () => {}, error: console.error });

const __dirname = dirname(fileURLToPath(import.meta.url));

// Cargar biblioteca local de canciones
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

// ─── Agente ──────────────────────────────────────────────────────────────────

const modelo = new OllamaModel("llama3.1");

const dj = new Agent({
  model: modelo,
  systemPrompt: `Eres un DJ y curador musical experto.
Usa la herramienta buscar_canciones para encontrar música en la biblioteca del usuario.
Siempre basa tus recomendaciones en canciones que el usuario realmente tiene.`,
  tools: [buscarCanciones],
});
await registerColorHooks(dj);

const prompt = "Quiero escuchar jazz mientras trabajo";
printPrompt(prompt);
printAgentPrefix();
await dj.invoke(prompt);
printAgentEnd();
