/**
 * Capa 1 — Agente Básico
 *
 * Concepto nuevo: Agent + modelo Ollama (local).
 * Sin herramientas, sin memoria. Solo responde con su conocimiento general.
 *
 * Requisitos:
 *   - Ollama corriendo en localhost:11434
 *   - Modelo llama3.1 descargado: `ollama pull llama3.1`
 */

import { Agent } from "@strands-agents/sdk";
import { createModel } from "./create_model.js";
import { printPrompt, streamColored } from "./utils_color.js";

const modelo = createModel(); // proveedor y modelo vienen del .env

const dj = new Agent({
  model: modelo,
  systemPrompt: `Eres un DJ y curador musical experto.
Respondes en español, con onda y buen gusto.
Recomiendas música basándote en el mood, la ocasión, y los gustos del usuario.`,
  printer: false, // manejamos la salida a mano con streamColored
});

const prompt = "¿Cuál fue el último éxito de Queen?";
printPrompt(prompt);
await streamColored(dj, prompt);
