/**
 * Capa 0 — Agente Básico
 *
 * Requisitos:
 *   - Ollama corriendo en localhost:11434
 *   - Modelo llama3.1 descargado: `ollama pull llama3.1`
 */

import "dotenv/config";
import { Agent } from "@strands-agents/sdk";
// import { BedrockModel } from "@strands-agents/sdk";
import { VercelModel } from "@strands-agents/sdk/models/vercel";
import { createOllama } from "ai-sdk-ollama";
import { printPrompt, streamColored } from "./utils_color.js";

const modelo = new VercelModel({
  provider: createOllama({
    baseURL: process.env.OLLAMA_HOST ?? "http://localhost:11434",
  })(process.env.MODEL_ID ?? "llama3.2"),
});
// const modelo = new BedrockModel({ modelId: process.env.BEDROCK_MODEL_ID ?? "us.amazon.nova-pro-v1:0", region: process.env.AWS_REGION ?? "us-east-1" });

const dj = new Agent({
  model: modelo,
  printer: false, // manejamos la salida a mano con streamColored
});

const prompt = "¿Cuál fue el último éxito de Queen?";
printPrompt(prompt);
await streamColored(dj, prompt);
