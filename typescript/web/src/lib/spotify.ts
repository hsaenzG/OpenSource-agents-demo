/**
 * Spotify integration para el web app.
 *
 * Usa el mismo cliente nativo (fetch) que el CLI. Lee el token cacheado que dejó
 * el flujo OAuth del CLI (../../.spotify_token.json) y, si no hay, cae a
 * Client Credentials (solo búsqueda, sin reproducción ni playlists).
 */

import { config as loadEnv } from "dotenv";
import { tool } from "@strands-agents/sdk";
import z from "zod";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { PlaybackState, PlaylistFull, SpotifyImage, SpotifyTrack } from "./spotify_client.js";
import { SpotifyClient, conFiltroDeAnios } from "./spotify_client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Cargamos el .env acá también. Este módulo lo importan los endpoints de
// playback/playlist directo (sin pasar por agent.ts), y sin esto process.env
// llega vacío en la primera llamada y la conexión a Spotify falla.
loadEnv({ path: resolve(__dirname, "../../.env") });

let sp: SpotifyClient | null = null;
let spotifyDisponible = false;
let spotifyUser: string | null = null; // display_name si hay sesión de usuario (no CC)
// Compartimos una sola inicialización entre llamadas concurrentes (chat + playback).
let initPromise: Promise<boolean> | null = null;

// Ruta canónica del token de usuario. Es la misma que escribe el CLI y la que
// el flujo OAuth del web (login/callback) usa para guardar el token.
export const TOKEN_PATH = resolve(__dirname, "../../../.spotify_token.json");

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

// Cache corto del status verificado, para no llamar a getMe en cada consulta.
let statusCache: { at: number; result: { connected: boolean; user: string | null } } | null = null;
const STATUS_TTL = 20_000;

/**
 * Estado REAL de la conexión para el sidebar. No confía en un flag memoizado:
 * si hay sesión de usuario, la verifica con getMe() (que refresca el token si
 * expiró). Si el token/refresh ya murió, reconecta desde cero — caerá a Client
 * Credentials (solo búsqueda) y reportará user:null, lo que hace que el botón
 * "Conectar Spotify" reaparezca y puedas reautenticar.
 */
export async function getSpotifyStatus(): Promise<{ connected: boolean; user: string | null }> {
  if (statusCache && Date.now() - statusCache.at < STATUS_TTL) return statusCache.result;

  let client = await ensureSpotifyReady();
  if (client && spotifyUser) {
    try {
      const me = await client.getMe(); // verifica de verdad; refresca si expiró
      spotifyUser = me.display_name ?? spotifyUser;
    } catch {
      // Sesión de usuario muerta (el refresh token ya no sirve). Reconectamos:
      // si el token del archivo ya no vale, connectSpotify cae a Client Credentials.
      resetSpotify();
      client = await ensureSpotifyReady();
    }
  }

  const result = { connected: !!client, user: spotifyUser };
  statusCache = { at: Date.now(), result };
  return result;
}

/**
 * Resetea la conexión para forzar una reconexión limpia (p. ej. después de que
 * el flujo OAuth guarda un token nuevo, o cuando el token murió). El próximo
 * initSpotify() reconecta.
 */
export function resetSpotify(): void {
  sp = null;
  spotifyDisponible = false;
  spotifyUser = null;
  initPromise = null;
  statusCache = null;
}

/**
 * Inicializa Spotify una sola vez. Llamadas repetidas reusan la misma promesa,
 * así el endpoint de chat y el de playback no compiten por conectar dos veces.
 */
export function initSpotify(): Promise<boolean> {
  if (!initPromise) {
    initPromise = connectSpotify().then((ok) => {
      // Si falló, soltamos la promesa para poder reintentar en la próxima llamada
      // (p. ej. si el .env aún no estaba listo o Spotify estaba caído un momento).
      if (!ok) initPromise = null;
      return ok;
    });
  }
  return initPromise;
}

/** Devuelve el cliente listo (o null si Spotify no está disponible). */
export async function ensureSpotifyReady(): Promise<SpotifyClient | null> {
  await initSpotify();
  return spotifyDisponible ? sp : null;
}

async function connectSpotify(): Promise<boolean> {
  const clientId = process.env.SPOTIFY_CLIENT_ID ?? "";
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET ?? "";

  if (!clientId || !clientSecret) {
    console.log("[Spotify] No hay SPOTIFY_CLIENT_ID o SPOTIFY_CLIENT_SECRET en .env");
    return false;
  }

  // Buscar el token cacheado (del CLI o del flujo OAuth del web) en varias rutas.
  const possiblePaths = [
    TOKEN_PATH,
    resolve(process.cwd(), "../.spotify_token.json"),
    resolve(process.cwd(), ".spotify_token.json"),
    resolve(process.cwd(), "../../.spotify_token.json"),
  ];

  for (const tokenPath of possiblePaths) {
    if (!existsSync(tokenPath)) continue;
    try {
      const tokenData: TokenData = JSON.parse(readFileSync(tokenPath, "utf-8"));
      const client = new SpotifyClient({
        clientId,
        clientSecret,
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        expiresAt: tokenData.expiresAt,
        // El cliente refresca solo si el token expiró; persistimos el nuevo.
        onTokenRefresh: (accessToken, expiresAt) => {
          writeFileSync(
            tokenPath,
            JSON.stringify(
              { accessToken, refreshToken: tokenData.refreshToken, expiresAt },
              null,
              2,
            ),
          );
        },
      });
      // getMe verifica el token y dispara un refresh si ya expiró.
      const user = await client.getMe();
      sp = client;
      spotifyDisponible = true;
      spotifyUser = user.display_name ?? "tu cuenta";
      console.log(`[Spotify] ✅ Conectado como ${user.display_name} (token de ${tokenPath})`);
      return true;
    } catch (e) {
      console.log(`[Spotify] Token inválido en ${tokenPath}: ${e}`);
    }
  }

  // Fallback: Client Credentials — token de app, solo búsqueda de catálogo.
  // expiresAt en 0 fuerza al cliente a pedir un token client_credentials en la
  // primera llamada (no hay refreshToken, así que usa ese grant).
  try {
    const client = new SpotifyClient({
      clientId,
      clientSecret,
      accessToken: "",
      refreshToken: "",
      expiresAt: 0,
    });
    // Probe: fuerza la obtención del token y verifica que la conexión sirva.
    await client.searchTracks("test", 1);
    sp = client;
    spotifyDisponible = true;
    spotifyUser = null; // sin sesión de usuario: solo búsqueda
    console.log("[Spotify] ⚠️  Conectado con Client Credentials (solo búsqueda, no reproducción)");
    return true;
  } catch (e) {
    console.log(`[Spotify] ❌ No se pudo conectar: ${e}`);
    return false;
  }
}

// ─── Tools de Spotify ────────────────────────────────────────────────────────

// Neutraliza los operadores de sintaxis de Spotify en texto libre: el guion excluye
// términos (operador NOT) y las comillas rompen el parseo de filtros. No tocamos
// palabras; dejamos que la relevancia de Spotify ordene. No aplica a buscar_en_spotify,
// que sí usa filtros (genre:/year:).
function limpiarParaBusqueda(texto: string): string {
  return texto
    .replace(/["']/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const buscarEnSpotify = tool({
  name: "buscar_en_spotify",
  description: `Busca canciones en Spotify. SIEMPRE úsala cuando el usuario pregunte por música.

Para tener VARIEDAD, no hagas una sola búsqueda genérica. Haz VARIAS búsquedas
distintas y combina los resultados. El query acepta los filtros de Spotify:
  - genre:  → "genre:house", "genre:deep-house", "genre:techno"
  - artist: → "artist:Disclosure"

Para armar una progresión de energía (por ejemplo un DJ set que sube de tranquilo
a intenso), busca por subgéneros de menor a mayor energía en llamadas separadas:
  deep house / melodic house → progressive house → tech house → peak-time.
Nota: Spotify ya no expone el BPM por track a estas apps, así que ordena por
subgénero y energía, no por un número de BPM exacto.

Para acotar por época, usa los parámetros 'anio_inicio' y 'anio_fin' (NO escribas
year: en el query, la herramienta arma el filtro sola).

Usa 'limite' alto (30-50) cuando quieras muchas opciones, y 'offset' para pedir
resultados distintos de una misma búsqueda (offset:20 trae los siguientes 20).`,
  inputSchema: z.object({
    query: z.string().describe("Texto de búsqueda, admite filtros genre:/artist:"),
    limite: z.number().optional().describe("Máximo de resultados, hasta 50 (default: 20)"),
    offset: z.number().optional().describe("Desde qué resultado empezar, para paginar y variar (default: 0)"),
    anio_inicio: z.number().optional().describe("Año inicial del rango, ej. 2015"),
    anio_fin: z.number().optional().describe("Año final del rango, ej. 2024"),
  }),
  callback: async (input) => {
    if (!spotifyDisponible || !sp) return "Spotify no está conectado.";
    const limite = Math.min(Math.max(input.limite ?? 20, 1), 50);
    const offset = Math.max(input.offset ?? 0, 0);
    const query = conFiltroDeAnios(input.query, input.anio_inicio, input.anio_fin);
    try {
      console.log(`[buscar_en_spotify] query=${JSON.stringify(query)} limite=${limite} offset=${offset}`);
      const tracks = await sp.searchTracks(query, limite, offset);
      console.log(`[buscar_en_spotify] → ${tracks.length} resultados`);
      if (tracks.length === 0) return `No encontré canciones en Spotify para: ${input.query}`;
      return JSON.stringify(
        tracks.map((t) => ({
          titulo: t.name,
          artista: t.artists[0].name,
          album: t.album.name,
          uri: t.uri,
          duracion_min: Math.round((t.duration_ms / 60000) * 10) / 10,
        })),
        null,
        2,
      );
    } catch (e) {
      console.error("[buscar_en_spotify] ERROR:", e);
      return `Error al buscar en Spotify: ${e}`;
    }
  },
});

export const reproducirCancion = tool({
  name: "reproducir_cancion",
  description: `Reproduce una canción en el dispositivo activo de Spotify del usuario.
SIEMPRE usa esta herramienta cuando el usuario pida escuchar, poner o reproducir una canción.

Manda el título en 'nombre_cancion' y el artista SIEMPRE en 'artista', por separado.
NO metas el artista dentro de 'nombre_cancion' (nada de "Título de Fulano" o "Título - Fulano").`,
  inputSchema: z.object({
    nombre_cancion: z
      .string()
      .describe("Solo el título de la canción, sin el artista"),
    artista: z
      .string()
      .optional()
      .describe("Artista, por separado. Inclúyelo siempre que lo sepas"),
  }),
  callback: async (input) => {
    if (!spotifyDisponible || !sp) return "Spotify no está conectado.";
    try {
      const devices = await sp.getDevices();
      if (devices.length === 0) {
        return "❌ No hay dispositivos activos de Spotify. Abre Spotify en tu celular o computadora e intenta de nuevo.";
      }

      const titulo = limpiarParaBusqueda(input.nombre_cancion);
      const artista = input.artista ? limpiarParaBusqueda(input.artista) : "";

      const intentos = artista
        ? [`${titulo} ${artista}`, `track:"${titulo}" artist:"${artista}"`, titulo]
        : [titulo, `track:"${titulo}"`];

      let tracks: SpotifyTrack[] = [];
      for (const q of intentos) {
        tracks = await sp.searchTracks(q, 5);
        if (tracks.length > 0) break;
      }
      if (tracks.length === 0) return `No encontré "${input.nombre_cancion}" en Spotify.`;

      const track = tracks[0];
      const deviceId = devices.find((d) => d.is_active)?.id ?? devices[0].id;
      if (!deviceId) {
        return "❌ No hay dispositivos activos de Spotify. Abre Spotify e intenta de nuevo.";
      }

      await sp.play(deviceId, [track.uri]);

      return JSON.stringify(
        {
          status: "reproduciendo",
          cancion: track.name,
          artista: track.artists[0].name,
          album: track.album.name,
          mensaje: `▶️ Reproduciendo: ${track.name} — ${track.artists[0].name}`,
        },
        null,
        2,
      );
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

    // Resolver URIs — si no es URI válida, buscar por nombre.
    const urisValidas: string[] = [];
    for (const item of input.canciones_uris) {
      const trimmed = item.trim();
      if (trimmed.startsWith("spotify:track:")) {
        urisValidas.push(trimmed);
      } else {
        try {
          await new Promise((r) => setTimeout(r, 500)); // Rate limiting
          const encontradas = await sp.searchTracks(trimmed, 1);
          if (encontradas.length > 0) urisValidas.push(encontradas[0].uri);
        } catch {
          /* skip */
        }
      }
    }
    if (urisValidas.length === 0) return "No pude encontrar ninguna de las canciones en Spotify.";

    try {
      const me = await sp.getMe();
      const playlist = await sp.createPlaylist(me.id, input.nombre, input.descripcion, false);

      // Agregar canciones en batches de 100.
      for (let i = 0; i < urisValidas.length; i += 100) {
        await sp.addTracksToPlaylist(playlist.id, urisValidas.slice(i, i + 100));
      }

      return JSON.stringify(
        {
          status: "ok",
          mensaje: `Playlist '${input.nombre}' creada con ${urisValidas.length} canciones`,
          url: playlist.external_urls.spotify,
        },
        null,
        2,
      );
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
      const artistas = await sp.getTopArtists(10, periodo);
      return JSON.stringify(
        artistas.map((a) => ({ nombre: a.name, generos: a.genres.slice(0, 3) })),
        null,
        2,
      );
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
      const canciones = await sp.getTopTracks(10, periodo);
      return JSON.stringify(
        canciones.map((t) => ({ titulo: t.name, artista: t.artists[0].name, uri: t.uri })),
        null,
        2,
      );
    } catch (e) {
      return `Error: ${e}`;
    }
  },
});

// ─── Servicio de playback y playlists (para los endpoints /api) ──────────────

/** Elige un cover de tamaño medio de la lista de imágenes de Spotify. */
function pickCover(images?: SpotifyImage[]): string | null {
  if (!images || images.length === 0) return null;
  // Spotify devuelve las imágenes de mayor a menor; la del medio se ve bien.
  return images[1]?.url ?? images[0]?.url ?? null;
}

export interface NowPlaying {
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
  title: string;
  artist: string;
  album: string;
  cover: string | null;
  uri: string | null;
  deviceName: string | null;
  volumePercent: number | null;
}

/** Estado normalizado de reproducción para el visor. null = nada sonando. */
export async function getNowPlaying(): Promise<NowPlaying | null> {
  const client = await ensureSpotifyReady();
  if (!client) return null;
  const state: PlaybackState | null = await client.getPlaybackState();
  if (!state || !state.item) return null;
  return {
    isPlaying: state.is_playing,
    progressMs: state.progress_ms ?? 0,
    durationMs: state.item.duration_ms ?? 0,
    title: state.item.name,
    artist: state.item.artists.map((a) => a.name).join(", "),
    album: state.item.album.name,
    cover: pickCover(state.item.album.images),
    uri: state.item.uri,
    deviceName: state.device?.name ?? null,
    volumePercent: state.device?.volume_percent ?? null,
  };
}

export type PlaybackAction = "play" | "pause" | "next" | "previous" | "seek" | "volume" | "playTrack";

const NO_DEVICE_MSG =
  "No hay un dispositivo de Spotify activo. Abre Spotify en tu celular o computadora (y dale play a algo una vez) para que aparezca.";

/**
 * Resuelve el dispositivo objetivo: el activo, o el primero disponible.
 * Devolver un device_id explícito hace que las acciones funcionen aunque el
 * dispositivo esté disponible pero no "activo" (la causa típica del 404).
 */
async function resolveDeviceId(client: SpotifyClient): Promise<string> {
  const devices = await client.getDevices();
  if (devices.length === 0) throw new Error(NO_DEVICE_MSG);
  const id = devices.find((d) => d.is_active)?.id ?? devices[0].id;
  if (!id) throw new Error(NO_DEVICE_MSG);
  return id;
}

/** Ejecuta una acción de control resolviendo primero el dispositivo objetivo. */
export async function controlPlayback(
  action: PlaybackAction,
  opts: { positionMs?: number; volumePercent?: number; uri?: string } = {},
): Promise<void> {
  const client = await ensureSpotifyReady();
  if (!client) throw new Error("Spotify no está conectado.");
  const deviceId = await resolveDeviceId(client);
  switch (action) {
    case "play":
      return client.resume(deviceId);
    case "pause":
      return client.pause(deviceId);
    case "next":
      return client.next(deviceId);
    case "previous":
      return client.previous(deviceId);
    case "seek":
      return client.seek(opts.positionMs ?? 0, deviceId);
    case "volume":
      return client.setVolume(opts.volumePercent ?? 50, deviceId);
    case "playTrack":
      if (!opts.uri) throw new Error("Falta el uri del track a reproducir.");
      return client.playUris([opts.uri], deviceId);
  }
}

export interface PlaylistCard {
  name: string;
  description: string;
  cover: string | null;
  url: string;
  total: number;
  tracks: { title: string; artist: string; cover: string | null; uri: string; durationMs: number }[];
}

/** Metadata normalizada de una playlist para renderizar la tarjeta. */
export async function getPlaylistMetadata(playlistId: string): Promise<PlaylistCard | null> {
  const client = await ensureSpotifyReady();
  if (!client) return null;
  const pl: PlaylistFull = await client.getPlaylist(playlistId);
  const tracks = (pl.tracks?.items ?? [])
    .map((it) => it.track)
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .map((t) => ({
      title: t.name,
      artist: t.artists.map((a) => a.name).join(", "),
      cover: pickCover(t.album.images),
      uri: t.uri,
      durationMs: t.duration_ms,
    }));
  return {
    name: pl.name,
    description: pl.description,
    cover: pickCover(pl.images),
    url: pl.external_urls?.spotify ?? `https://open.spotify.com/playlist/${playlistId}`,
    total: pl.tracks?.total ?? tracks.length,
    tracks,
  };
}
