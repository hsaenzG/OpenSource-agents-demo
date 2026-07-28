/**
 * API de metadata de playlists.
 *   GET /api/playlist?id=<playlistId>  → nombre, cover, descripción y tracks
 *
 * Se usa para renderizar una tarjeta bonita cuando el agente crea una playlist.
 */

import type { APIRoute } from "astro";
import { getPlaylistMetadata } from "../../lib/spotify.js";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async ({ url }) => {
  const id = url.searchParams.get("id")?.trim();
  if (!id) return json({ error: "Falta el parámetro 'id'." }, 400);

  try {
    const card = await getPlaylistMetadata(id);
    if (!card) return json({ error: "Spotify no está conectado." }, 200);
    return json(card);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return json({ error: message }, 200);
  }
};
