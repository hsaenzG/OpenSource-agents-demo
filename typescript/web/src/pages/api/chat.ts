/**
 * API endpoint para el chat del DJ Agent.
 * POST /api/chat — recibe { message: string } y devuelve { response, toolsUsed }
 */

import type { APIRoute } from "astro";
import { getAgent, registerToolTracking } from "../../lib/agent.js";

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const message = body.message?.trim();

    if (!message) {
      return new Response(JSON.stringify({ error: "No se proporcionó un mensaje." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const agent = getAgent();
    const toolsUsed = registerToolTracking(agent);

    const result = await agent.invoke(message);
    const responseText = String(result.lastMessage ?? result);

    return new Response(
      JSON.stringify({
        response: responseText,
        toolsUsed: [...toolsUsed],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    return new Response(
      JSON.stringify({
        error: `Error del agente: ${errorMessage}`,
        toolsUsed: [],
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
