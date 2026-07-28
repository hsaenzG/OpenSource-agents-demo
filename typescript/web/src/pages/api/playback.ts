/**
 * API de reproducción de Spotify.
 *   GET  /api/playback              → estado actual (visor "now playing")
 *   POST /api/playback { action }   → play | pause | next | previous | seek | volume
 *
 * Requiere Spotify Premium y un dispositivo activo (Spotify abierto en algún lado).
 */

import type { APIRoute } from "astro";
import { getNowPlaying, controlPlayback, type PlaybackAction } from "../../lib/spotify.js";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async () => {
  try {
    const now = await getNowPlaying();
    if (!now) return json({ active: false });
    return json({ active: true, ...now });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return json({ active: false, error: message }, 200);
  }
};

const VALID_ACTIONS: PlaybackAction[] = ["play", "pause", "next", "previous", "seek", "volume", "playTrack"];

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const action = body.action as PlaybackAction;

    if (!VALID_ACTIONS.includes(action)) {
      return json({ error: `Acción inválida: ${action}` }, 400);
    }

    await controlPlayback(action, {
      positionMs: typeof body.positionMs === "number" ? body.positionMs : undefined,
      volumePercent: typeof body.volumePercent === "number" ? body.volumePercent : undefined,
      uri: typeof body.uri === "string" ? body.uri : undefined,
    });

    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";

    // "Restriction violated" = el comando no aplica al estado actual (p. ej.
    // pausar algo ya pausado). Es inofensivo: no es un error real para el user.
    if (/Restriction violated/i.test(message)) {
      return json({ ok: true, noop: true });
    }
    // Sin dispositivo activo.
    if (/NO_ACTIVE_DEVICE|No active device|404/.test(message)) {
      return json({
        error: "No hay un dispositivo de Spotify activo. Abre Spotify (y dale play una vez) para poder controlarlo.",
      });
    }
    // Cuenta sin Premium (Spotify solo permite control remoto con Premium).
    if (/PREMIUM_REQUIRED/i.test(message) || /403/.test(message)) {
      return json({ error: "Se requiere Spotify Premium para controlar la reproducción." });
    }
    return json({ error: message });
  }
};
