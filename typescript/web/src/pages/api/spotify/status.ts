/**
 * Estado de la conexión con Spotify para el sidebar.
 * GET /api/spotify/status → { connected, user }
 *   - user: string  → sesión de usuario (puede reproducir y crear playlists)
 *   - user: null    → solo búsqueda (Client Credentials) o sin conexión
 */

import type { APIRoute } from "astro";
import { getSpotifyStatus } from "../../../lib/spotify.js";

export const GET: APIRoute = async () => {
  try {
    const status = await getSpotifyStatus();
    return new Response(JSON.stringify(status), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return new Response(JSON.stringify({ connected: false, user: null, error: msg }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
};
