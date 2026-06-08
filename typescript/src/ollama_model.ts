/**
 * OllamaModel — Wrapper tolerante para usar Ollama con Strands Agents SDK (TypeScript).
 *
 * Problema: ai-sdk-ollama no emite modelMessageStartEvent ni un stopReason válido,
 * causando "Stream ended without completing a message" que aborta el agent loop.
 *
 * Solución: interceptar stream() para inyectar modelMessageStartEvent al inicio
 * y corregir el stopReason del modelMessageStopEvent.
 */

import { VercelModel } from "@strands-agents/sdk/models/vercel";
import { ollama } from "ai-sdk-ollama";
import type { Message } from "@strands-agents/sdk";

type ModelStreamEvent = any;

/**
 * Modelo Ollama compatible con Strands que corrige los eventos faltantes del stream.
 */
export class OllamaModel extends VercelModel {
  constructor(modelId: string, host: string = "http://localhost:11434") {
    super({ provider: (ollama as any)(modelId, { baseURL: host }) });
  }

  /**
   * Override stream() to:
   * 1. Inject modelMessageStartEvent if missing (Ollama doesn't emit it)
   * 2. Fix stopReason on modelMessageStopEvent when it's missing/undefined
   */
  override async *stream(
    messages: Message[],
    options?: any
  ): AsyncGenerator<ModelStreamEvent> {
    const parentStream = super.stream(messages, options) as any;
    let hasMessageStart = false;
    let hasToolUse = false;

    while (true) {
      const { value, done } = await parentStream.next();
      if (done) break;

      const event = value as any;

      // Inject modelMessageStartEvent before the first content block if missing
      if (!hasMessageStart && event?.type === "modelContentBlockStartEvent") {
        hasMessageStart = true;
        yield { type: "modelMessageStartEvent", role: "assistant" };
      }

      // Track tool use
      if (event?.type === "modelContentBlockStartEvent" && event.start?.type === "toolUseStart") {
        hasToolUse = true;
      }

      // Fix modelMessageStopEvent with missing stopReason or wrong stopReason
      if (event?.type === "modelMessageStopEvent") {
        hasMessageStart = false; // Reset for next iteration
        const correctStopReason = hasToolUse ? "toolUse" : "endTurn";
        if (event.stopReason !== correctStopReason) {
          yield { ...event, stopReason: correctStopReason };
          hasToolUse = false;
          continue;
        }
        hasToolUse = false;
      }

      yield event;
    }

    // If stream ended without a modelMessageStopEvent, inject one
    if (hasMessageStart) {
      yield {
        type: "modelMessageStopEvent",
        stopReason: hasToolUse ? "toolUse" : "endTurn",
      };
    }
  }
}
