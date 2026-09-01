/**
 * Capa 2 — Con Herramientas (Tool Calling)
 *
 * Concepto nuevo: @tool — el agente puede buscar canciones en una biblioteca local JSON.
 *
 * Requisitos:
 *   - Ollama corriendo en localhost:11434
 *   - Modelo llama3.1 descargado
 */

import "dotenv/config";
import { Agent, tool } from "@strands-agents/sdk";
// import { BedrockModel } from "@strands-agents/sdk";
import { VercelModel } from "@strands-agents/sdk/models/vercel";
import { createOllama } from "ai-sdk-ollama";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import z from "zod";
import { printPrompt, streamColored } from "./utils_color.js";

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
    const norm = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    let resultados = BIBLIOTECA;

    if (input.genero) {
      resultados = resultados.filter((c) =>
        norm(c.genero).includes(norm(input.genero!))
      );
    }
    if (input.mood) {
      resultados = resultados.filter((c) =>
        norm(c.mood).includes(norm(input.mood!))
      );
    }
    if (input.artista) {
      resultados = resultados.filter((c) =>
        norm(c.artista).includes(norm(input.artista!))
      );
    }

    if (resultados.length === 0) {
      return "No encontré canciones con esos criterios en tu biblioteca.";
    }

    return JSON.stringify(resultados.slice(0, 10), null, 2);
  },
});

// ─── Agente ──────────────────────────────────────────────────────────────────

const modelo = new VercelModel({
  provider: createOllama({
    baseURL: process.env.OLLAMA_HOST ?? "http://localhost:11434",
  })(process.env.MODEL_ID ?? "llama3.2"),
});
// const modelo = new BedrockModel({ modelId: process.env.BEDROCK_MODEL_ID ?? "us.amazon.nova-pro-v1:0", region: process.env.AWS_REGION ?? "us-east-1" });

const dj = new Agent({
  model: modelo,
  systemPrompt: `Eres un DJ y curador musical experto.
Usa la herramienta buscar_canciones para encontrar música en la biblioteca del usuario.
Siempre basa tus recomendaciones en canciones que el usuario realmente tiene.`,
  tools: [buscarCanciones],
  printer: false, // manejamos la salida a mano con streamColored
});

const prompt = "Quiero escuchar jazz mientras trabajo";
printPrompt(prompt);
await streamColored(dj, prompt);
