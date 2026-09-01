/**
 * Capa 6 — Multi-Agente con Orquestador
 *
 * Concepto nuevo: un agente orquestador que decide a cuál sub-agente delegar.
 * El usuario habla con UN solo agente que internamente decide si la tarea es
 * para el DJ Personal, el DJ de Eventos o el DJ Emocional.
 *
 * Arquitectura:
 *
 *     ┌─────────────────────────────────────────────┐
 *     │         Agente Orquestador                   │
 *     │  "Soy tu DJ principal. Analizo tu mensaje   │
 *     │   y decido a quién delegarlo."              │
 *     │                                              │
 *     │  Tools:                                      │
 *     │    - consultar_dj_personal(mensaje)          │
 *     │    - consultar_dj_eventos(mensaje)           │
 *     │    - consultar_dj_emocional(mensaje)         │
 *     └──────────┬──────────────┬───────────────────┘
 *                │              │              │
 *                ▼              ▼              ▼
 *     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
 *     │ DJ Personal  │ │ DJ Eventos   │ │ DJ Emocional │
 *     │ (sub-agente) │ │ (sub-agente) │ │ (sub-agente) │
 *     │ tools: [...]  │ │ tools: [...]  │ │ tools: [...]  │
 *     └──────────────┘ └──────────────┘ └──────────────┘
 *
 * El concepto clave: los sub-agentes se exponen como @tool del orquestador.
 *
 * Requisitos:
 *   - AWS CLI configurado con acceso a Amazon Bedrock
 *   - (Opcional) Spotify configurado en .env
 */

import "dotenv/config";
import { Agent, tool } from "@strands-agents/sdk";
// import { BedrockModel } from "@strands-agents/sdk";
import { VercelModel } from "@strands-agents/sdk/models/vercel";
import { createOllama } from "ai-sdk-ollama";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "node:readline/promises";
import z from "zod";
import type { SpotifyClient } from "./spotify_client.js";
import { conFiltroDeAnios } from "./spotify_client.js";
import { authenticateSpotify } from "./spotify_auth.js";
import { YELLOW, RESET, streamColored } from "./utils_color.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Cancion {
  titulo: string;
  artista: string;
  genero: string;
  mood: string;
  energia: number;
  duracion_min: number;
}

const BIBLIOTECA: Cancion[] = JSON.parse(
  readFileSync(resolve(__dirname, "../data/canciones.json"), "utf-8"),
);

// ─── Spotify Setup (OAuth completo) ─────────────────────────────────────────

let spotifyDisponible = false;
let sp: SpotifyClient | null = null;

const clientId = process.env.SPOTIFY_CLIENT_ID ?? "";
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET ?? "";

if (clientId && clientSecret) {
  try {
    sp = await authenticateSpotify(clientId, clientSecret);
    spotifyDisponible = true;
  } catch (e) {
    console.log(`⚠️  Spotify no disponible: ${e}`);
  }
} else {
  console.log(
    "⚠️  Spotify no configurado. Los agentes usarán la biblioteca local.",
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOLS COMPARTIDOS — Usados por los sub-agentes
// ═══════════════════════════════════════════════════════════════════════════════

const buscarEnSpotify = tool({
  name: "buscar_en_spotify",
  description: `Busca canciones en Spotify. SIEMPRE úsala antes de responder sobre música.

Para VARIEDAD, haz varias búsquedas distintas en vez de una genérica. El query
acepta filtros: "genre:house", "genre:deep-house year:2018-2024", "artist:Disclosure".
Para una progresión de energía (DJ set que sube de tranquilo a intenso), busca por
subgéneros de menor a mayor energía en llamadas separadas: deep/melodic house →
progressive house → tech house → peak-time. Spotify ya no expone el BPM por track a
estas apps, así que ordena por subgénero y energía, no por un BPM exacto.
Para acotar por época usa 'anio_inicio' y 'anio_fin' (NO escribas year: en el query).
Usa 'limite' alto (30-50) para más opciones y 'offset' para paginar y variar.`,
  inputSchema: z.object({
    query: z.string().describe("Texto de búsqueda, admite filtros genre:/artist:"),
    limite: z.coerce
      .number()
      .optional()
      .describe("Máximo de resultados, hasta 50 (default: 20)"),
    offset: z.coerce
      .number()
      .optional()
      .describe("Desde qué resultado empezar, para paginar y variar (default: 0)"),
    anio_inicio: z.coerce
      .number()
      .optional()
      .describe("Año inicial del rango, ej. 2015"),
    anio_fin: z.coerce
      .number()
      .optional()
      .describe("Año final del rango, ej. 2024"),
  }),
  callback: async (input) => {
    if (!spotifyDisponible || !sp) return "Spotify no está conectado.";
    const limite = Math.min(Math.max(input.limite ?? 20, 1), 50);
    const offset = Math.max(input.offset ?? 0, 0);
    const query = conFiltroDeAnios(input.query, input.anio_inicio, input.anio_fin);
    try {
      const tracks = await sp.searchTracks(query, limite, offset);
      if (tracks.length === 0)
        return `No encontré canciones en Spotify para: ${input.query}`;
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
      return `Error al buscar en Spotify: ${e}`;
    }
  },
});

const buscarCanciones = tool({
  name: "buscar_canciones",
  description: "Busca canciones en la biblioteca musical LOCAL del usuario.",
  inputSchema: z.object({
    genero: z.string().optional().describe("Género musical"),
    mood: z.string().optional().describe("Estado de ánimo"),
    artista: z.string().optional().describe("Nombre del artista"),
  }),
  callback: (input) => {
    let resultados = BIBLIOTECA;
    if (input.genero)
      resultados = resultados.filter((c) =>
        c.genero.toLowerCase().includes(input.genero!.toLowerCase()),
      );
    if (input.mood)
      resultados = resultados.filter((c) =>
        c.mood.toLowerCase().includes(input.mood!.toLowerCase()),
      );
    if (input.artista)
      resultados = resultados.filter((c) =>
        c.artista.toLowerCase().includes(input.artista!.toLowerCase()),
      );
    if (resultados.length === 0)
      return "No encontré canciones con esos criterios en tu biblioteca local.";
    return JSON.stringify(resultados.slice(0, 10), null, 2);
  },
});

const crearPlaylistEnSpotify = tool({
  name: "crear_playlist_en_spotify",
  description: "Crea una playlist en Spotify con las canciones indicadas.",
  inputSchema: z.object({
    nombre: z.string().describe("Nombre de la playlist"),
    descripcion: z.string().describe("Descripción breve"),
    canciones_uris: z
      .array(z.string())
      .describe("Lista de URIs de Spotify o nombres de canciones"),
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
          const encontradas = await sp.searchTracks(trimmed, 1);
          if (encontradas.length > 0) urisValidas.push(encontradas[0].uri);
        } catch {
          /* skip */
        }
      }
    }
    if (urisValidas.length === 0)
      return "No pude encontrar ninguna de las canciones en Spotify.";

    try {
      const me = await sp.getMe();
      const playlist = await sp.createPlaylist(
        me.id,
        input.nombre,
        input.descripcion,
        false,
      );
      for (let i = 0; i < urisValidas.length; i += 100) {
        await sp.addTracksToPlaylist(
          playlist.id,
          urisValidas.slice(i, i + 100),
        );
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
      return `Error al crear la playlist: ${e}`;
    }
  },
});

const reproducirCancion = tool({
  name: "reproducir_cancion",
  description: `Reproduce una canción en el dispositivo activo de Spotify del usuario.
SIEMPRE usa esta herramienta cuando el usuario pida escuchar, poner o reproducir una canción.`,
  inputSchema: z.object({
    nombre_cancion: z.string().describe("Nombre de la canción"),
    artista: z.string().optional().describe("Artista"),
  }),
  callback: async (input) => {
    if (!spotifyDisponible || !sp) return "Spotify no está conectado.";
    try {
      const devices = await sp.getDevices();
      if (devices.length === 0) {
        return "❌ No hay dispositivos activos de Spotify. Abre Spotify e intenta de nuevo.";
      }

      let query = `track:${input.nombre_cancion}`;
      if (input.artista) query += ` artist:${input.artista}`;
      let tracks = await sp.searchTracks(query, 5);

      if (tracks.length === 0) {
        tracks = await sp.searchTracks(
          `${input.nombre_cancion} ${input.artista ?? ""}`.trim(),
          5,
        );
      }
      if (tracks.length === 0)
        return `No encontré "${input.nombre_cancion}" en Spotify.`;

      const track = tracks[0];
      const deviceId =
        devices.find((d) => d.is_active)?.id ?? devices[0].id;
      await sp.play(deviceId!, [track.uri]);

      return JSON.stringify(
        {
          status: "reproduciendo",
          cancion: track.name,
          artista: track.artists[0].name,
          mensaje: `▶️ Reproduciendo: ${track.name} — ${track.artists[0].name}`,
        },
        null,
        2,
      );
    } catch (e: any) {
      const msg = e.message ?? String(e);
      if (
        msg.includes("NO_ACTIVE_DEVICE") ||
        msg.includes("Player command failed")
      ) {
        return "❌ No hay dispositivos activos de Spotify. Abre Spotify e intenta de nuevo.";
      }
      return `❌ Error al reproducir: ${msg}`;
    }
  },
});

const planificarEvento = tool({
  name: "planificar_evento",
  description: "Genera un plan musical para un evento.",
  inputSchema: z.object({
    tipo_evento: z.string().describe("Tipo de evento"),
    tema: z.string().describe("Tema del evento"),
    duracion_horas: z.number().describe("Duración en horas"),
    audiencia: z.string().describe("Audiencia"),
    energia: z.string().optional().describe("'baja', 'media' o 'alta'"),
  }),
  callback: (input) => {
    const duracionMin = input.duracion_horas * 60;
    const cancionesNecesarias = Math.floor(duracionMin / 3.5);
    return JSON.stringify(
      {
        evento: input.tipo_evento,
        tema: input.tema,
        duracion_horas: input.duracion_horas,
        canciones_necesarias: cancionesNecesarias,
        sugerencias_busqueda: [
          `${input.tema} soundtrack`,
          `${input.tema} music`,
          `${input.tipo_evento} music`,
        ],
      },
      null,
      2,
    );
  },
});

const analizarEmocion = tool({
  name: "analizar_emocion",
  description: `Mapea una emoción a géneros musicales y artistas recomendados para buscar en Spotify.
USA los queries_spotify devueltos para buscar canciones con buscar_en_spotify.`,
  inputSchema: z.object({
    emocion: z
      .string()
      .describe("Estado de ánimo (ej: triste, feliz, ansioso, motivado)"),
  }),
  callback: (input) => {
    const mapa: Record<string, any> = {
      triste: {
        generos: ["indie folk", "acoustic", "piano ambient"],
        artistas_sugeridos: [
          "Bon Iver",
          "Sufjan Stevens",
          "Daughter",
          "Iron & Wine",
        ],
        queries_spotify: [
          "indie folk acoustic",
          "sad piano instrumental",
          "melancholic indie",
        ],
        energia: "baja",
        consejo: "La música melancólica ayuda a procesar.",
      },
      feliz: {
        generos: ["pop", "funk", "disco", "reggae"],
        artistas_sugeridos: [
          "Daft Punk",
          "Bruno Mars",
          "Pharrell",
          "Bob Marley",
        ],
        queries_spotify: [
          "funk disco groovy",
          "happy pop hits",
          "feel good reggae",
        ],
        energia: "alta",
        consejo: "¡A celebrar! Funk, disco y pop.",
      },
      ansioso: {
        generos: ["ambient", "lo-fi hip hop", "classical piano"],
        artistas_sugeridos: [
          "Brian Eno",
          "Nils Frahm",
          "Ludovico Einaudi",
          "Tycho",
        ],
        queries_spotify: [
          "ambient relaxing",
          "lo-fi chill beats",
          "calm piano classical",
        ],
        energia: "muy baja",
        consejo:
          "Respira profundo. Ambient y piano para bajar las revoluciones.",
      },
      nostálgico: {
        generos: ["classic rock", "80s pop", "oldies", "bolero"],
        artistas_sugeridos: [
          "The Beatles",
          "Queen",
          "Fleetwood Mac",
          "Luis Miguel",
        ],
        queries_spotify: [
          "80s classic hits",
          "classic rock ballads",
          "oldies gold",
        ],
        energia: "media",
        consejo: "Los recuerdos suenan mejor con clásicos.",
      },
      enamorado: {
        generos: ["R&B", "soul", "bossa nova", "jazz vocal"],
        artistas_sugeridos: [
          "Frank Sinatra",
          "Norah Jones",
          "John Legend",
          "Sade",
        ],
        queries_spotify: [
          "romantic R&B soul",
          "bossa nova love",
          "jazz vocal romantic",
        ],
        energia: "media-baja",
        consejo: "El amor suena a soul, bossa nova y jazz.",
      },
      enojado: {
        generos: ["metal", "punk rock", "hard rock", "rap agresivo"],
        artistas_sugeridos: [
          "Metallica",
          "Rage Against the Machine",
          "System of a Down",
        ],
        queries_spotify: [
          "heavy metal aggressive",
          "punk rock energy",
          "hard rock anthems",
        ],
        energia: "muy alta",
        consejo: "A sacar la energía. Metal y punk para descargar.",
      },
      motivado: {
        generos: ["hip-hop", "electronic", "rock alternativo"],
        artistas_sugeridos: ["Eminem", "Imagine Dragons", "The Killers"],
        queries_spotify: [
          "hip hop motivation",
          "rock alternativo energético",
          "workout electronic",
        ],
        energia: "alta",
        consejo: "¡Vamos con todo! Hip-hop y rock para el empujón.",
      },
      relajado: {
        generos: ["jazz", "lo-fi", "acoustic", "chill electronic"],
        artistas_sugeridos: [
          "Miles Davis",
          "Khruangbin",
          "Jack Johnson",
          "Bonobo",
        ],
        queries_spotify: [
          "jazz chill smooth",
          "acoustic relaxing",
          "chill electronic downtempo",
        ],
        energia: "baja",
        consejo: "Modo zen. Jazz y lo-fi para flotar.",
      },
      concentrado: {
        generos: ["lo-fi hip hop", "ambient", "post-rock", "minimal"],
        artistas_sugeridos: ["Explosions in the Sky", "Mogwai", "Tycho"],
        queries_spotify: [
          "lo-fi study beats",
          "post-rock instrumental",
          "ambient focus",
        ],
        energia: "baja-media",
        consejo: "Sin distracciones. Instrumental y ambient para enfocarte.",
      },
    };

    const emocionLower = input.emocion.toLowerCase().trim();
    let resultado = mapa[emocionLower];

    if (!resultado) {
      for (const [key, value] of Object.entries(mapa)) {
        if (key.includes(emocionLower) || emocionLower.includes(key)) {
          resultado = value;
          break;
        }
      }
    }

    if (!resultado) {
      resultado = {
        generos: ["pop", "indie", "alternative"],
        artistas_sugeridos: ["Coldplay", "The xx", "Tame Impala"],
        queries_spotify: [
          `${input.emocion} mood music`,
          "indie alternative chill",
        ],
        energia: "media",
        consejo: `No conozco exactamente '${input.emocion}', pero buscaré algo que encaje.`,
      };
    }

    return JSON.stringify(
      {
        ...resultado,
        emocion_detectada: input.emocion,
        instruccion:
          "USA los queries_spotify para buscar canciones con buscar_en_spotify.",
      },
      null,
      2,
    );
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-AGENTES — Cada uno es un especialista con su propia personalidad
// ═══════════════════════════════════════════════════════════════════════════════

const modelo = new VercelModel({
  provider: createOllama({
    baseURL: process.env.OLLAMA_HOST ?? "http://localhost:11434",
  })(process.env.MODEL_ID ?? "llama3.2"),
});
// const modelo = new BedrockModel({ modelId: process.env.BEDROCK_MODEL_ID ?? "us.amazon.nova-pro-v1:0", region: process.env.AWS_REGION ?? "us-east-1" });

const djPersonal = new Agent({
  name: "dj_personal",
  description: "DJ personal experto en gustos musicales y recomendaciones.",
  model: modelo,
  systemPrompt: `Eres un DJ personal experto. Conoces los gustos del usuario.
SIEMPRE usa buscar_en_spotify antes de recomendar. NUNCA inventes datos.
Respondes en español, con onda.`,
  tools: [
    buscarEnSpotify,
    buscarCanciones,
    crearPlaylistEnSpotify,
    reproducirCancion,
  ],
  printer: false,
});

const djEventos = new Agent({
  name: "dj_eventos",
  description: "DJ profesional para armar playlists de eventos con duración.",
  model: modelo,
  systemPrompt: `Eres un DJ profesional de eventos. Armas playlists para fiestas, bodas, cenas.
SIEMPRE usa buscar_en_spotify. Usa planificar_evento para estructurar la playlist.
Verifica que la duración cubra el evento. Respondes en español.`,
  tools: [
    buscarEnSpotify,
    buscarCanciones,
    crearPlaylistEnSpotify,
    reproducirCancion,
    planificarEvento,
  ],
  printer: false,
});

const djEmocional = new Agent({
  name: "dj_emocional",
  description: "DJ empático especializado en emociones y estados de ánimo.",
  model: modelo,
  systemPrompt: `Eres un DJ empático especializado en emociones y música.

FLUJO OBLIGATORIO:
1. Usa analizar_emocion para obtener géneros y queries de búsqueda
2. Usa los queries_spotify del resultado para buscar con buscar_en_spotify
3. NUNCA busques la emoción como título
4. Crea una playlist con las canciones encontradas

Eres sensible y no juzgas. Respondes en español con calidez.`,
  tools: [
    buscarEnSpotify,
    buscarCanciones,
    crearPlaylistEnSpotify,
    reproducirCancion,
    analizarEmocion,
  ],
  printer: false,
});

// ═══════════════════════════════════════════════════════════════════════════════
// TOOLS DEL ORQUESTADOR — Cada sub-agente se expone como un tool con asTool()
// ═══════════════════════════════════════════════════════════════════════════════

// asTool() envuelve el agente como herramienta: invoca al sub-agente, extrae el
// texto de la respuesta y arranca conversación fresca en cada llamada
// (preserveContext: false por default). Adiós al extractText y al invoke manual.

const consultarDjPersonal = djPersonal.asTool({
  name: "consultar_dj_personal",
  description: `Delega al DJ Personal: experto en gustos musicales y recomendaciones personalizadas.
Úsalo cuando el usuario quiera recomendaciones, descubrir música nueva, o reproduzca algo.`,
});

const consultarDjEventos = djEventos.asTool({
  name: "consultar_dj_eventos",
  description: `Delega al DJ de Eventos: experto en armar playlists para ocasiones específicas.
Úsalo cuando el usuario mencione un evento, fiesta, boda, cena o pida una playlist con duración.`,
});

const consultarDjEmocional = djEmocional.asTool({
  name: "consultar_dj_emocional",
  description: `Delega al DJ Emocional: experto en música y estados de ánimo.
Úsalo cuando el usuario exprese cómo se siente o quiera música para acompañar un estado de ánimo.`,
});

// ═══════════════════════════════════════════════════════════════════════════════
// AGENTE ORQUESTADOR — El punto de entrada principal
// ═══════════════════════════════════════════════════════════════════════════════

const orquestador = new Agent({
  model: modelo,
  systemPrompt: `Eres el DJ principal. Tu trabajo es entender qué necesita el usuario
y delegarlo al sub-agente especializado correcto.

Tienes 3 DJs especializados disponibles como herramientas:

1. consultar_dj_personal — Para recomendaciones, descubrir música, reproducir canciones,
   "ponme algo", "recomiéndame", "qué hay nuevo de X artista".

2. consultar_dj_eventos — Para eventos con duración específica: fiestas, bodas, cenas,
   "arma una playlist de 3 horas para una fiesta".

3. consultar_dj_emocional — Para estados de ánimo: "estoy triste", "me siento motivado",
   "necesito música para relajarme".

REGLAS:
- Si el usuario dice un nombre de canción o artista, usa consultar_dj_personal.
- Para estados de ánimo y emociones, usa consultar_dj_emocional.
- Para eventos con duración, usa consultar_dj_eventos.
- Pasa el mensaje COMPLETO del usuario al sub-agente.
- Si no estás seguro, usa consultar_dj_personal como default.
- NUNCA muestres tu razonamiento interno. NO uses tags como <thinking>.
- SIEMPRE después de recibir la respuesta del sub-agente, DEBES presentarla al usuario con tu propio estilo. NO te quedes en silencio.
- Tu respuesta final SIEMPRE debe incluir el contenido que el sub-agente encontró. Reformúlalo con tu personalidad de DJ.

Respondes en español con onda rockera. 🎸🤘`,
  tools: [consultarDjPersonal, consultarDjEventos, consultarDjEmocional],
  printer: false, // manejamos la salida a mano con streamColored
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTERFAZ DE CONSOLA
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n🎧 DJ Multi-Agente con Orquestador");
console.log("=".repeat(50));
console.log("Un solo agente que delega a 3 DJs especializados.");
console.log("Solo habla — el orquestador decide a quién preguntar.\n");
console.log("Ejemplos:");
console.log("  • 'Recomiéndame algo de rock' → DJ Personal");
console.log("  • 'Arma una playlist de 2h para una cena' → DJ Eventos");
console.log("  • 'Estoy triste, ponme algo' → DJ Emocional");
console.log("\nEscribe 'salir' para terminar.\n");

const rl = createInterface({ input: process.stdin, output: process.stdout });

while (true) {
  let mensaje: string;
  try {
    mensaje = (await rl.question(`${YELLOW}🎵 Tú: ${RESET}`)).trim();
  } catch (error: any) {
    // Ctrl+C (SIGINT) hace que readline aborte la pregunta. Salimos limpio.
    if (error?.code === "ABORT_ERR") break;
    throw error;
  }

  if (mensaje === "") continue;
  if (mensaje.toLowerCase().match(/^(salir|exit|quit)$/)) break;

  await streamColored(orquestador, mensaje);
}

console.log("\n👋 ¡Nos vemos! Que suene buena música.");
rl.close();
