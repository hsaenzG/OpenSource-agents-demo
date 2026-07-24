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

import { Agent, configureLogging } from "@strands-agents/sdk";
import { createModel } from "./create_model.js";
import { printPrompt, printAgentPrefix, printAgentEnd } from "./utils_color.js";

// Suprimir warnings del SDK (finish_reason undefined de Ollama)
configureLogging({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: console.error,
});

const modelo = createModel(); // proveedor y modelo vienen del .env

const dj = new Agent({
  model: modelo,
  systemPrompt: `Eres un DJ y curador musical experto.
Respondes en español, con onda y buen gusto.
Recomiendas música basándote en el mood, la ocasión, y los gustos del usuario.`,
});

const prompt = "¿Cuál fue el último éxito de Queen?";
printPrompt(prompt);
printAgentPrefix();
await dj.invoke(prompt);
printAgentEnd();
