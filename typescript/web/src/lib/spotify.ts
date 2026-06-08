/**
 * Spotify integration para el web app.
 * Usa el token cacheado del CLI (../../.spotify_token.json) o Client Credentials.
 */

import { tool } from "@strands-agents/sdk";
import z from "zod";
import SpotifyWebApi from "spotify-web-api-node";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Resolver ruta al token — el archivo está en typescript/.spotify_token.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = resolve(__dirname, "../../../.spotify_token.json");

let sp: SpotifyWebApi | null = null;
let spotifyDisponible = false;

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export async function initSpotify(): Promise<boolean> {
  const clientId = process.env.SPOTIFY_CLIENT_ID ?? "";
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET ?? "";

  if (!clientId || !clientSecret) {
    console.log("[Spotify] No hay SPOTIFY_CLIENT_ID o SPOTIFY_CLIENT_SECRET en .env");
    return false;
  }

  sp = new SpotifyWebApi({ clientId, clientSecret, redirectUri: "http://127.0.0.1:8000/callback" });

  // Buscar token en varias rutas posibles
  const possiblePaths = [
    TOKEN_PATH,
    resolve(process.cwd(), "../.spotify_token.json"),
    resolve(process.cwd(), ".spotify_token.json"),
    resolve(process.cwd(), "../../.spotify_token.json"),
  ];

  let tokenLoaded = false;
  for (const tokenPath of possiblePaths) {
    if (existsSync(tokenPath)) {
      try {
        const tokenData: TokenData = JSON.parse(readFileSync(tokenPath, "utf-8"));
        sp.setAccessToken(tokenData.accessToken);
        sp.setRefreshToken(tokenData.refreshToken);

        // Refrescar si expiró
        if (Date.now() > tokenData.expiresAt - 60000) {
          console.log("[Spotify] Token expirado, refrescando...");
          const refreshed = await sp.refreshAccessToken();
          sp.setAccessToken(refreshed.body.access_token);
          // Actualizar el archivo de token
          const { writeFileSync } = await import("fs");
          writeFileSync(tokenPath, JSON.stringify({
            accessToken: refreshed.body.access_token,
            refreshToken: tokenData.refreshToken,
            expiresAt: Date.now() + refreshed.body.expires_in * 1000,
          }, null, 2));
        }

        await sp.getMe(); // Verificar
        spotifyDisponible = true;
        tokenLoaded = true;
        console.log(`[Spotify] ✅ Conectado con token de: ${tokenPath}`);
        break;
      } catch (e) {
        console.log(`[Spotify] Token inválido en ${tokenPath}: ${e}`);
      }
    }
  }

  if (!tokenLoaded) {
    // Fallback: Client Credentials (solo búsqueda, no reproducción)
    try {
      const data = await sp.clientCredentialsGrant();
      sp.setAccessToken(data.body.access_token);
      spotifyDisponible = true;
      console.log("[Spotify] ⚠️  Conectado con Client Credentials (solo búsqueda, no reproducción)");
      return true;
    } catch (e) {
      console.log(`[Spotify] ❌ No se pudo conectar: ${e}`);
      return false;
    }
  }

  return tokenLoaded;
}

// ─── Tools de Spotify ────────────────────────────────────────────────────────

export const buscarEnSpotify = tool({
  name: "buscar_en_spotify",
  description: `Busca canciones en Spotify por nombre, artista o género.
SIEMPRE usa esta herramienta cuando el usuario pregunte por canciones, artistas o música.`,
  inputSchema: z.object({
    query: z.string().describe("Texto de búsqueda"),
    limite: z.number().optional().describe("Número máximo de resultados (default: 10)"),
  }),
  callback: async (input) => {
    if (!spotifyDisponible || !sp) return "Spotify no está conectado.";
    const limite = Math.min(Math.max(input.limite ?? 10, 1), 10);
    try {
      const result = await sp.searchTracks(input.query, { limit: limite });
      const tracks = result.body.tracks?.items ?? [];
      if (tracks.length === 0) return `No encontré canciones en Spotify para: ${input.query}`;
      return JSON.stringify(tracks.map((t) => ({
        titulo: t.name,
        artista: t.artists[0].name,
        album: t.album.name,
        uri: t.uri,
        duracion_min: Math.round((t.duration_ms / 60000) * 10) / 10,
      })), null, 2);
    } catch (e) {
      return `Error al buscar en Spotify: ${e}`;
    }
  },
});

export const reproducirCancion = tool({
  name: "reproducir_cancion",
  description: `Reproduce una canción en el dispositivo activo de Spotify del usuario.
SIEMPRE usa esta herramienta cuando el usuario pida escuchar, poner o reproducir una canción.`,
  inputSchema: z.object({
    nombre_cancion: z.string().describe("Nombre de la canción a reproducir"),
    artista: z.string().optional().describe("Nombre del artista (opcional)"),
  }),
  callback: async (input) => {
    if (!spotifyDisponible || !sp) return "Spotify no está conectado.";
    try {
      const devices = await sp.getMyDevices();
      if (!devices.body.devices?.length) {
        return "❌ No hay dispositivos activos de Spotify. Abre Spotify en tu celular o computadora e intenta de nuevo.";
      }

      let query = `track:${input.nombre_cancion}`;
      if (input.artista) query += ` artist:${input.artista}`;
      let result = await sp.searchTracks(query, { limit: 5 });
      let tracks = result.body.tracks?.items ?? [];

      if (tracks.length === 0) {
        result = await sp.searchTracks(`${input.nombre_cancion} ${input.artista ?? ""}`.trim(), { limit: 5 });
        tracks = result.body.tracks?.items ?? [];
      }
      if (tracks.length === 0) return `No encontré "${input.nombre_cancion}" en Spotify.`;

      const track = tracks[0];
      const deviceId = devices.body.devices.find((d) => d.is_active)?.id ?? devices.body.devices[0].id;
      
      // Usar fetch directo porque spotify-web-api-node tiene un bug con .play() y callbacks
      const accessToken = sp.getAccessToken();
      const playResponse = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uris: [track.uri] }),
      });

      if (!playResponse.ok && playResponse.status !== 204) {
        const err = await playResponse.text();
        throw new Error(err);
      }

      return JSON.stringify({
        status: "reproduciendo",
        cancion: track.name,
        artista: track.artists[0].name,
        album: track.album.name,
        mensaje: `▶️ Reproduciendo: ${track.name} — ${track.artists[0].name}`,
      }, null, 2);
    } catch (e: any) {
      const msg = e.message ?? String(e);
      if (msg.includes("NO_ACTIVE_DEVICE") || msg.includes("Player command failed")) {
        return "❌ No hay dispositivos activos de Spotify. Abre Spotify en tu celular o computadora.";
      }
      if (msg.includes("PREMIUM_REQUIRED")) {
        return "❌ Se requiere Spotify Premium para controlar la reproducción.";
      }
      return `❌ Error al reproducir: ${msg}`;
    }
  },
});

export const crearPlaylistEnSpotify = tool({
  name: "crear_playlist_en_spotify",
  description: "Crea una playlist en Spotify con las canciones indicadas.",
  inputSchema: z.object({
    nombre: z.string().describe("Nombre de la playlist"),
    descripcion: z.string().describe("Descripción breve"),
    canciones_uris: z.array(z.string()).describe("Lista de URIs de Spotify o nombres de canciones"),
  }),
  callback: async (input) => {
    if (!spotifyDisponible || !sp) return "Spotify no está conectado.";
    if (!input.canciones_uris?.length) return "No me diste canciones.";

    const urisValidas: string[] = [];
    for (const item of input.canciones_uris) {
      const trimmed = item.trim();
      if (trimmed.startsWith("spotify:track:")) {
        urisValidas.push(trimmed);
      } else {
        try {
          await new Promise((r) => setTimeout(r, 500));
          const r = await sp.searchTracks(trimmed, { limit: 1 });
          const tracks = r.body.tracks?.items ?? [];
          if (tracks.length > 0) urisValidas.push(tracks[0].uri);
        } catch { /* skip */ }
      }
    }
    if (urisValidas.length === 0) return "No pude encontrar ninguna de las canciones en Spotify.";

    try {
      const accessToken = sp.getAccessToken();
      const me = await sp.getMe();
      const userId = me.body.id;

      // Crear playlist con fetch directo (evitar bug de callbacks de spotify-web-api-node)
      const createResp = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: input.nombre, public: false, description: input.descripcion }),
      });
      if (!createResp.ok) throw new Error(await createResp.text());
      const playlist = await createResp.json() as any;

      // Agregar canciones en batches de 100
      for (let i = 0; i < urisValidas.length; i += 100) {
        const batch = urisValidas.slice(i, i + 100);
        const addResp = await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ uris: batch }),
        });
        if (!addResp.ok) throw new Error(await addResp.text());
      }

      return JSON.stringify({
        status: "ok",
        mensaje: `Playlist '${input.nombre}' creada con ${urisValidas.length} canciones`,
        url: playlist.external_urls.spotify,
      }, null, 2);
    } catch (e) {
      return `Error al crear playlist: ${e}`;
    }
  },
});

export const misTopArtistas = tool({
  name: "mis_top_artistas",
  description: "Obtiene los artistas más escuchados del usuario en Spotify.",
  inputSchema: z.object({
    periodo: z.string().optional().describe('"short_term", "medium_term", "long_term"'),
  }),
  callback: async (input) => {
    if (!spotifyDisponible || !sp) return "Spotify no está conectado.";
    try {
      const periodo = (input.periodo ?? "medium_term") as "short_term" | "medium_term" | "long_term";
      const result = await sp.getMyTopArtists({ limit: 10, time_range: periodo });
      return JSON.stringify(result.body.items.map((a) => ({ nombre: a.name, generos: a.genres.slice(0, 3) })), null, 2);
    } catch (e) {
      return `Error: ${e}`;
    }
  },
});

export const misTopCanciones = tool({
  name: "mis_top_canciones",
  description: "Obtiene las canciones más escuchadas del usuario en Spotify.",
  inputSchema: z.object({
    periodo: z.string().optional().describe('"short_term", "medium_term", "long_term"'),
  }),
  callback: async (input) => {
    if (!spotifyDisponible || !sp) return "Spotify no está conectado.";
    try {
      const periodo = (input.periodo ?? "medium_term") as "short_term" | "medium_term" | "long_term";
      const result = await sp.getMyTopTracks({ limit: 10, time_range: periodo });
      return JSON.stringify(result.body.items.map((t) => ({ titulo: t.name, artista: t.artists[0].name, uri: t.uri })), null, 2);
    } catch (e) {
      return `Error: ${e}`;
    }
  },
});
