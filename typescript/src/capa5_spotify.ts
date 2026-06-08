/**
 * Capa 5 — Conexión con Spotify (OAuth completo)
 *
 * Concepto nuevo: herramientas que se conectan a APIs externas.
 * El agente puede buscar, reproducir, crear playlists y ver tus tops en Spotify.
 *
 * Requisitos:
 *   1. Crear una app en https://developer.spotify.com/dashboard
 *   2. Agregar http://127.0.0.1:8000/callback como Redirect URI
 *   3. Crear un archivo .env con SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET
 *   4. AWS CLI configurado con acceso a Amazon Bedrock
 *   5. Spotify abierto en algún dispositivo para reproducción
 */

import { Agent, tool } from "@strands-agents/sdk";
import { BedrockModel } from "@strands-agents/sdk";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";
import z from "zod";
import { config } from "dotenv";
import SpotifyWebApi from "spotify-web-api-node";
import { authenticateSpotify } from "./spotify_auth.js";
import { GREEN, YELLOW, RESET, printAgentPrefix, printAgentEnd, registerColorHooks } from "./utils_color.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

interface Cancion {
  titulo: string;
  artista: string;
  genero: string;
  mood: string;
  energia: number;
  duracion_min: number;
}

const BIBLIOTECA: Cancion[] = JSON.parse(
  readFileSync(resolve(__dirname, "../data/canciones.json"), "utf-8")
);

// ─── Spotify Setup (OAuth completo) ─────────────────────────────────────────

let spotifyDisponible = false;
let sp: SpotifyWebApi | null = null;

const clientId = process.env.SPOTIFY_CLIENT_ID ?? "";
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET ?? "";

if (clientId && clientSecret) {
  try {
    sp = await authenticateSpotify(clientId, clientSecret);
    spotifyDisponible = true;
  } catch (e) {
    console.log(`⚠️  Spotify no disponible: ${e}`);
    console.log("   El agente funcionará solo con la biblioteca local.\n");
  }
} else {
  console.log("⚠️  Spotify no configurado (falta SPOTIFY_CLIENT_ID/SECRET en .env)");
  console.log("   El agente funcionará solo con la biblioteca local.\n");
}

// ─── Tools ───────────────────────────────────────────────────────────────────

const buscarEnSpotify = tool({
  name: "buscar_en_spotify",
  description: `Busca canciones en Spotify por nombre, artista o género.
SIEMPRE usa esta herramienta cuando el usuario pregunte por canciones, artistas o música.`,
  inputSchema: z.object({
    query: z.string().describe("Texto de búsqueda"),
    limite: z.number().optional().describe("Número máximo de resultados (default: 10)"),
  }),
  callback: async (input) => {
    if (!spotifyDisponible || !sp) {
      return "Spotify no está conectado.";
    }
    const limite = Math.min(Math.max(input.limite ?? 10, 1), 10);
    try {
      const result = await sp.searchTracks(input.query, { limit: limite });
      const tracks = result.body.tracks?.items ?? [];
      if (tracks.length === 0) {
        return `No encontré canciones en Spotify para: ${input.query}`;
      }
      const canciones = tracks.map((t) => ({
        titulo: t.name,
        artista: t.artists[0].name,
        album: t.album.name,
        uri: t.uri,
        duracion_min: Math.round((t.duration_ms / 60000) * 10) / 10,
      }));
      return JSON.stringify(canciones, null, 2);
    } catch (e) {
      return `Error al buscar en Spotify: ${e}`;
    }
  },
});

const buscarCanciones = tool({
  name: "buscar_canciones",
  description: `Busca canciones en la biblioteca musical LOCAL del usuario.`,
  inputSchema: z.object({
    genero: z.string().optional().describe("Género musical"),
    mood: z.string().optional().describe("Estado de ánimo"),
    artista: z.string().optional().describe("Nombre del artista"),
  }),
  callback: (input) => {
    let resultados = BIBLIOTECA;
    if (input.genero) {
      resultados = resultados.filter((c) =>
        c.genero.toLowerCase().includes(input.genero!.toLowerCase())
      );
    }
    if (input.mood) {
      resultados = resultados.filter((c) =>
        c.mood.toLowerCase().includes(input.mood!.toLowerCase())
      );
    }
    if (input.artista) {
      resultados = resultados.filter((c) =>
        c.artista.toLowerCase().includes(input.artista!.toLowerCase())
      );
    }
    if (resultados.length === 0) {
      return "No encontré canciones con esos criterios en tu biblioteca local.";
    }
    return JSON.stringify(resultados.slice(0, 10), null, 2);
  },
});

const reproducirCancion = tool({
  name: "reproducir_cancion",
  description: `Reproduce una canción en el dispositivo activo de Spotify del usuario.
Busca la canción por nombre en Spotify y la reproduce automáticamente.
SIEMPRE usa esta herramienta cuando el usuario pida escuchar, poner o reproducir una canción.`,
  inputSchema: z.object({
    nombre_cancion: z.string().describe("Nombre de la canción a reproducir"),
    artista: z.string().optional().describe("Nombre del artista (opcional, ayuda a encontrar la canción correcta)"),
  }),
  callback: async (input) => {
    if (!spotifyDisponible || !sp) {
      return "Spotify no está conectado.";
    }
    try {
      // Verificar dispositivos activos
      const devices = await sp.getMyDevices();
      if (!devices.body.devices?.length) {
        return "❌ No hay dispositivos activos de Spotify. Abre Spotify en tu celular o computadora e intenta de nuevo.";
      }

      // Buscar la canción
      let query = `track:${input.nombre_cancion}`;
      if (input.artista) query += ` artist:${input.artista}`;

      let result = await sp.searchTracks(query, { limit: 5 });
      let tracks = result.body.tracks?.items ?? [];

      // Fallback: búsqueda libre
      if (tracks.length === 0) {
        const freeQuery = `${input.nombre_cancion} ${input.artista ?? ""}`.trim();
        result = await sp.searchTracks(freeQuery, { limit: 5 });
        tracks = result.body.tracks?.items ?? [];
      }

      if (tracks.length === 0) {
        return `No encontré "${input.nombre_cancion}" en Spotify.`;
      }

      const track = tracks[0];

      // Buscar dispositivo activo
      const deviceId =
        devices.body.devices.find((d) => d.is_active)?.id ??
        devices.body.devices[0].id;

      await sp.play({ device_id: deviceId!, uris: [track.uri] });

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
        return "❌ No hay dispositivos activos de Spotify. Abre Spotify en tu celular o computadora e intenta de nuevo.";
      }
      if (msg.includes("PREMIUM_REQUIRED")) {
        return "❌ Se requiere Spotify Premium para controlar la reproducción remotamente.";
      }
      return `❌ Error al reproducir: ${msg}`;
    }
  },
});

const crearPlaylistEnSpotify = tool({
  name: "crear_playlist_en_spotify",
  description: `Crea una playlist en la cuenta de Spotify del usuario con las canciones indicadas.`,
  inputSchema: z.object({
    nombre: z.string().describe("Nombre de la playlist"),
    descripcion: z.string().describe("Descripción breve de la playlist"),
    canciones_uris: z.array(z.string()).describe("Lista de URIs de Spotify o nombres de canciones"),
  }),
  callback: async (input) => {
    if (!spotifyDisponible || !sp) {
      return "Spotify no está conectado.";
    }
    if (!input.canciones_uris?.length) {
      return "No me diste canciones para agregar a la playlist.";
    }

    // Resolver URIs — si no es URI válida, buscar por nombre
    const urisValidas: string[] = [];
    for (const item of input.canciones_uris) {
      const trimmed = item.trim();
      if (trimmed.startsWith("spotify:track:")) {
        urisValidas.push(trimmed);
      } else {
        try {
          await new Promise((r) => setTimeout(r, 500)); // Rate limiting
          const r = await sp.searchTracks(trimmed, { limit: 1 });
          const tracks = r.body.tracks?.items ?? [];
          if (tracks.length > 0) {
            urisValidas.push(tracks[0].uri);
          }
        } catch { /* skip */ }
      }
    }

    if (urisValidas.length === 0) {
      return "No pude encontrar ninguna de las canciones en Spotify.";
    }

    try {
      const me = await sp.getMe();
      const playlist = await (sp as any).createPlaylist(me.body.id, input.nombre, {
        public: false,
        description: input.descripcion,
      });

      // Agregar canciones en batches de 100
      for (let i = 0; i < urisValidas.length; i += 100) {
        await sp.addTracksToPlaylist((playlist as any).body.id, urisValidas.slice(i, i + 100));
      }

      return JSON.stringify({
        status: "ok",
        mensaje: `Playlist '${input.nombre}' creada con ${urisValidas.length} canciones`,
        url: (playlist as any).body.external_urls.spotify,
      }, null, 2);
    } catch (e) {
      return `Error al crear la playlist: ${e}`;
    }
  },
});

const misTopArtistas = tool({
  name: "mis_top_artistas",
  description: `Obtiene los artistas más escuchados del usuario en Spotify.`,
  inputSchema: z.object({
    periodo: z.string().optional().describe('"short_term" (último mes), "medium_term" (6 meses), "long_term" (siempre)'),
  }),
  callback: async (input) => {
    if (!spotifyDisponible || !sp) return "Spotify no está conectado.";
    try {
      const periodo = (input.periodo ?? "medium_term") as "short_term" | "medium_term" | "long_term";
      const result = await sp.getMyTopArtists({ limit: 10, time_range: periodo });
      return JSON.stringify(
        result.body.items.map((a) => ({ nombre: a.name, generos: a.genres.slice(0, 3) })),
        null, 2
      );
    } catch (e) {
      return `Error: ${e}`;
    }
  },
});

const misTopCanciones = tool({
  name: "mis_top_canciones",
  description: `Obtiene las canciones más escuchadas del usuario en Spotify.`,
  inputSchema: z.object({
    periodo: z.string().optional().describe('"short_term", "medium_term", "long_term"'),
  }),
  callback: async (input) => {
    if (!spotifyDisponible || !sp) return "Spotify no está conectado.";
    try {
      const periodo = (input.periodo ?? "medium_term") as "short_term" | "medium_term" | "long_term";
      const result = await sp.getMyTopTracks({ limit: 10, time_range: periodo });
      return JSON.stringify(
        result.body.items.map((t) => ({ titulo: t.name, artista: t.artists[0].name, uri: t.uri })),
        null, 2
      );
    } catch (e) {
      return `Error: ${e}`;
    }
  },
});

// ─── Agente ──────────────────────────────────────────────────────────────────

const modelo = new BedrockModel({
  modelId: "us.amazon.nova-pro-v1:0",
  region: "us-east-1",
});

const dj = new Agent({
  model: modelo,
  systemPrompt: `Eres un DJ personal con acceso TOTAL a Spotify. NO eres un modelo de lenguaje genérico.
Tienes herramientas reales que controlan Spotify. ÚSALAS SIEMPRE.

⚠️ PROHIBICIONES ABSOLUTAS:
- NUNCA digas "no puedo reproducir" o "no tengo la capacidad".
- NUNCA sugieras al usuario que haga algo manualmente. TÚ lo haces con tus herramientas.
- NUNCA inventes información sobre canciones, artistas o URLs.
- NUNCA respondas sin haber llamado al menos una herramienta primero.

✅ LO QUE DEBES HACER:
1. Si el usuario pide REPRODUCIR algo → llama reproducir_cancion(nombre_cancion="...", artista="...")
2. Si el usuario pide una PLAYLIST → busca con buscar_en_spotify, luego crear_playlist_en_spotify
3. Si el usuario pregunta por MÚSICA → llama buscar_en_spotify PRIMERO
4. Si el usuario dice un nombre de canción o "ponme X" → llama reproducir_cancion INMEDIATAMENTE
5. Para conocer gustos → llama mis_top_artistas o mis_top_canciones

Respondes en español, con onda y buen gusto musical. 🎸🤘`,
  tools: [
    buscarEnSpotify,
    buscarCanciones,
    reproducirCancion,
    crearPlaylistEnSpotify,
    misTopArtistas,
    misTopCanciones,
  ],
});
await registerColorHooks(dj);

// ─── Conversación interactiva ────────────────────────────────────────────────

console.log("\n🎧 DJ Personal con Spotify");
console.log("=".repeat(50));
console.log("Escribe tu mensaje (o 'salir' para terminar)\n");

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (): void => {
  rl.question(`${YELLOW}🎵 Tú: ${RESET}`, async (mensaje) => {
    if (!mensaje || mensaje.toLowerCase().match(/^(salir|exit|quit)$/)) {
      console.log("\n👋 ¡Nos vemos! Que suene buena música.");
      rl.close();
      return;
    }

    printAgentPrefix();
    try {
      await dj.invoke(mensaje);
    } catch (e: any) {
      console.log(`\n⚠️ Error: ${e.message}`);
    }
    printAgentEnd();

    askQuestion();
  });
};

askQuestion();
