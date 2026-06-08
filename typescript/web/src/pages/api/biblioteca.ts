/**
 * API endpoint para estadísticas de la biblioteca.
 * GET /api/biblioteca
 */

import type { APIRoute } from "astro";
import { BIBLIOTECA } from "../../lib/canciones.js";

export const GET: APIRoute = async () => {
  const generos: Record<string, number> = {};
  const moods: Record<string, number> = {};

  for (const c of BIBLIOTECA) {
    generos[c.genero] = (generos[c.genero] || 0) + 1;
    moods[c.mood] = (moods[c.mood] || 0) + 1;
  }

  return new Response(
    JSON.stringify({
      total: BIBLIOTECA.length,
      generos,
      moods,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
};
