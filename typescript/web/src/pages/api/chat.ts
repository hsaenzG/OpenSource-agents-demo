/**
 * API de chat del DJ Agent — streaming en tiempo real (SSE).
 *
 * POST /api/chat { message } → stream de eventos Server-Sent:
 *   { type: "tool",  name }         cada vez que el agente usa una herramienta
 *   { type: "text",  delta }        fragmentos de la respuesta conforme se generan
 *   { type: "done",  response, toolsUsed }
 *   { type: "error", error }
 *
 * El cliente lee el body como stream (fetch + ReadableStream), no EventSource,
 * porque necesitamos POST.
 */

import type { APIRoute } from "astro";
import { getAgent } from "../../lib/agent.js";

/**
 * Quita los bloques de razonamiento <thinking>...</thinking> que algunos modelos
 * (Nova) escupen en el texto. Corta también un <thinking> abierto sin cerrar,
 * para no mostrar razonamiento parcial mientras llega el stream.
 */
function stripThinking(s: string): string {
  let out = s.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  const open = out.search(/<thinking>/i);
  if (open !== -1) out = out.slice(0, open);
  return out;
}

/** Saca el texto legible del AgentResult final (fallback si no hubo deltas). */
function extractText(result: any): string {
  const msg = result?.lastMessage;
  if (!msg) return "";
  if (typeof msg === "string") return msg;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((b: any) => b.type === "text" || b.text)
      .map((b: any) => b.text ?? "")
      .filter((t: string) => t.trim().length > 0)
      .join("\n");
  }
  return "";
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!message) {
    return new Response(JSON.stringify({ error: "No se proporcionó un mensaje." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        const agent = await getAgent();
        const iterator = agent.stream(message);
        const toolsUsed = new Set<string>();
        let raw = ""; // texto crudo del modelo (puede traer <thinking>)
        let cleanSent = ""; // texto limpio ya enviado al cliente

        while (true) {
          const { value, done } = await iterator.next();

          if (done) {
            // value es el AgentResult final.
            const finalText =
              stripThinking(raw).trim() || extractText(value) || "Sin respuesta del agente.";
            send({ type: "done", response: finalText, toolsUsed: [...toolsUsed] });
            break;
          }

          const event: any = value;

          if (event.type === "beforeToolCallEvent") {
            const name = event.toolUse?.name ?? "tool";
            toolsUsed.add(name);
            send({ type: "tool", name });
          } else if (event.type === "modelStreamUpdateEvent") {
            const inner = event.event;
            if (
              inner?.type === "modelContentBlockDeltaEvent" &&
              inner.delta?.type === "textDelta" &&
              typeof inner.delta.text === "string"
            ) {
              raw += inner.delta.text;
              // Emitimos solo el texto limpio nuevo (sin los bloques <thinking>).
              const clean = stripThinking(raw);
              if (clean.length > cleanSent.length) {
                send({ type: "text", delta: clean.slice(cleanSent.length) });
                cleanSent = clean;
              }
            }
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Error desconocido";
        send({ type: "error", error: `Error del agente: ${msg}` });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
};
