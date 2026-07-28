/**
 * Inicia el OAuth de Spotify: redirige al usuario a la pantalla de autorización.
 * GET /api/spotify/login
 */

import type { APIRoute } from "astro";
import { buildAuthorizeUrl } from "../../../lib/spotify_auth.js";

export const GET: APIRoute = async ({ redirect }) => {
  const clientId = process.env.SPOTIFY_CLIENT_ID ?? "";
  if (!clientId) {
    return new Response("Falta SPOTIFY_CLIENT_ID en el .env", { status: 500 });
  }
  // state simple para mitigar CSRF; suficiente para uso local de un solo usuario.
  const state = Math.random().toString(36).slice(2);
  return redirect(buildAuthorizeUrl(clientId, state), 302);
};
