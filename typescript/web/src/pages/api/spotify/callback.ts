/**
 * Callback del OAuth de Spotify. Recibe el ?code=, lo intercambia por tokens,
 * los guarda y resetea la conexión para que el web reconecte como usuario.
 * GET /api/spotify/callback
 */

import type { APIRoute } from "astro";
import { exchangeCode, saveToken } from "../../../lib/spotify_auth.js";
import { resetSpotify, initSpotify } from "../../../lib/spotify.js";

export const GET: APIRoute = async ({ url, redirect }) => {
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) return redirect(`/?spotify=error&reason=${encodeURIComponent(error)}`, 302);
  if (!code) return redirect("/?spotify=error&reason=missing_code", 302);

  const clientId = process.env.SPOTIFY_CLIENT_ID ?? "";
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret) {
    return redirect("/?spotify=error&reason=missing_credentials", 302);
  }

  try {
    const tokenData = await exchangeCode(clientId, clientSecret, code);
    saveToken(tokenData);
    // Forzamos reconexión con el token de usuario recién guardado.
    resetSpotify();
    await initSpotify();
    return redirect("/?spotify=connected", 302);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error_desconocido";
    return redirect(`/?spotify=error&reason=${encodeURIComponent(msg)}`, 302);
  }
};
