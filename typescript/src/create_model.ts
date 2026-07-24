/**
 * Factory de modelo — decide el proveedor según MODEL_PROVIDER en .env.
 *
 * Un solo punto para elegir con qué modelo corren TODAS las capas.
 *
 *   MODEL_PROVIDER=ollama   (default) → modelo local. Usa MODEL_ID y OLLAMA_HOST.
 *   MODEL_PROVIDER=bedrock            → Amazon Bedrock. Usa BEDROCK_MODEL_ID y AWS_REGION.
 */

import "dotenv/config"; // carga .env antes de leer process.env
import { BedrockModel } from "@strands-agents/sdk";
import { OllamaModel } from "./ollama_model.js";

export function createModel() {
  const provider = (process.env.MODEL_PROVIDER ?? "ollama").toLowerCase();

  switch (provider) {
    case "ollama":
      // OllamaModel ya lee MODEL_ID y OLLAMA_HOST desde el .env
      return new OllamaModel();

    case "bedrock":
      return new BedrockModel({
        modelId: process.env.BEDROCK_MODEL_ID ?? "us.amazon.nova-pro-v1:0",
        region: process.env.AWS_REGION ?? "us-east-1",
      });

    default:
      throw new Error(
        `MODEL_PROVIDER desconocido: "${provider}". Usa "ollama" o "bedrock".`
      );
  }
}
