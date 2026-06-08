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
  }
} else {
  console.log("⚠️  Spotify no configurado. Los agentes usarán la biblioteca local.");
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOLS COMPARTIDOS — Usados por los sub-agentes
// ═══════════════════════════════════════════════════════════════════════════════

const buscarEnSpotify = tool({
  name: "buscar_en_spotify",
  description: "Busca canciones en Spotify. SIEMPRE úsala antes de responder sobre música.",
  inputSchema: z.object({
    query: z.string().describe("Texto de búsqueda"),
    limite: z.number().optional().describe("Máximo de resultados (default: 10)"),
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
    if (input.genero) resultados = resultados.filter((c) => c.genero.toLowerCase().includes(input.genero!.toLowerCase()));
    if (input.mood) resultados = resultados.filter((c) => c.mood.toLowerCase().includes(input.mood!.toLowerCase()));
    if (input.artista) resultados = resultados.filter((c) => c.artista.toLowerCase().includes(input.artista!.toLowerCase()));
    if (resultados.length === 0) return "No encontré canciones con esos criterios en tu biblioteca local.";
    return JSON.stringify(resultados.slice(0, 10), null, 2);
  },
});

const crearPlaylistEnSpotify = tool({
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
      const me = await sp.getMe();
      const playlist = await (sp as any).createPlaylist(me.body.id, input.nombre, {
        public: false,
        description: input.descripcion,
      });
      for (let i = 0; i < urisValidas.length; i += 100) {
        await sp.addTracksToPlaylist(playlist.body.id, urisValidas.slice(i, i + 100));
      }
      return JSON.stringify({
        status: "ok",
        mensaje: `Playlist '${input.nombre}' creada con ${urisValidas.length} canciones`,
        url: playlist.body.external_urls.spotify,
      }, null, 2);
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
      const devices = await sp.getMyDevices();
      if (!devices.body.devices?.length) {
        return "❌ No hay dispositivos activos de Spotify. Abre Spotify e intenta de nuevo.";
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
      await sp.play({ device_id: deviceId!, uris: [track.uri] });

      return JSON.stringify({
        status: "reproduciendo",
        cancion: track.name,
        artista: track.artists[0].name,
        mensaje: `▶️ Reproduciendo: ${track.name} — ${track.artists[0].name}`,
      }, null, 2);
    } catch (e: any) {
      const msg = e.message ?? String(e);
      if (msg.includes("NO_ACTIVE_DEVICE") || msg.includes("Player command failed")) {
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
    return JSON.stringify({
      evento: input.tipo_evento,
      tema: input.tema,
      duracion_horas: input.duracion_horas,
      canciones_necesarias: cancionesNecesarias,
      sugerencias_busqueda: [`${input.tema} soundtrack`, `${input.tema} music`, `${input.tipo_evento} music`],
    }, null, 2);
  },
});

const analizarEmocion = tool({
  name: "analizar_emocion",
  description: `Mapea una emoción a géneros musicales y artistas recomendados para buscar en Spotify.
USA los queries_spotify devueltos para buscar canciones con buscar_en_spotify.`,
  inputSchema: z.object({
    emocion: z.string().describe("Estado de ánimo (ej: triste, feliz, ansioso, motivado)"),
  }),
  callback: (input) => {
    const mapa: Record<string, any> = {
      triste: {
        generos: ["indie folk", "acoustic", "piano ambient"],
        artistas_sugeridos: ["Bon Iver", "Sufjan Stevens", "Daughter", "Iron & Wine"],
        queries_spotify: ["indie folk acoustic", "sad piano instrumental", "melancholic indie"],
        energia: "baja",
        consejo: "La música melancólica ayuda a procesar.",
      },
      feliz: {
        generos: ["pop", "funk", "disco", "reggae"],
        artistas_sugeridos: ["Daft Punk", "Bruno Mars", "Pharrell", "Bob Marley"],
        queries_spotify: ["funk disco groovy", "happy pop hits", "feel good reggae"],
        energia: "alta",
        consejo: "¡A celebrar! Funk, disco y pop.",
      },
      ansioso: {
        generos: ["ambient", "lo-fi hip hop", "classical piano"],
        artistas_sugeridos: ["Brian Eno", "Nils Frahm", "Ludovico Einaudi", "Tycho"],
        queries_spotify: ["ambient relaxing", "lo-fi chill beats", "calm piano classical"],
        energia: "muy baja",
        consejo: "Respira profundo. Ambient y piano para bajar las revoluciones.",
      },
      nostálgico: {
        generos: ["classic rock", "80s pop", "oldies", "bolero"],
        artistas_sugeridos: ["The Beatles", "Queen", "Fleetwood Mac", "Luis Miguel"],
        queries_spotify: ["80s classic hits", "classic rock ballads", "oldies gold"],
        energia: "media",
        consejo: "Los recuerdos suenan mejor con clásicos.",
      },
      enamorado: {
        generos: ["R&B", "soul", "bossa nova", "jazz vocal"],
        artistas_sugeridos: ["Frank Sinatra", "Norah Jones", "John Legend", "Sade"],
        queries_spotify: ["romantic R&B soul", "bossa nova love", "jazz vocal romantic"],
        energia: "media-baja",
        consejo: "El amor suena a soul, bossa nova y jazz.",
      },
      enojado: {
        generos: ["metal", "punk rock", "hard rock", "rap agresivo"],
        artistas_sugeridos: ["Metallica", "Rage Against the Machine", "System of a Down"],
        queries_spotify: ["heavy metal aggressive", "punk rock energy", "hard rock anthems"],
        energia: "muy alta",
        consejo: "A sacar la energía. Metal y punk para descargar.",
      },
      motivado: {
        generos: ["hip-hop", "electronic", "rock alternativo"],
        artistas_sugeridos: ["Eminem", "Imagine Dragons", "The Killers"],
        queries_spotify: ["hip hop motivation", "rock alternativo energético", "workout electronic"],
        energia: "alta",
        consejo: "¡Vamos con todo! Hip-hop y rock para el empujón.",
      },
      relajado: {
        generos: ["jazz", "lo-fi", "acoustic", "chill electronic"],
        artistas_sugeridos: ["Miles Davis", "Khruangbin", "Jack Johnson", "Bonobo"],
        queries_spotify: ["jazz chill smooth", "acoustic relaxing", "chill electronic downtempo"],
        energia: "baja",
        consejo: "Modo zen. Jazz y lo-fi para flotar.",
      },
      concentrado: {
        generos: ["lo-fi hip hop", "ambient", "post-rock", "minimal"],
        artistas_sugeridos: ["Explosions in the Sky", "Mogwai", "Tycho"],
        queries_spotify: ["lo-fi study beats", "post-rock instrumental", "ambient focus"],
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
        queries_spotify: [`${input.emocion} mood music`, "indie alternative chill"],
        energia: "media",
        consejo: `No conozco exactamente '${input.emocion}', pero buscaré algo que encaje.`,
      };
    }

    return JSON.stringify({
      ...resultado,
      emocion_detectada: input.emocion,
      instruccion: "USA los queries_spotify para buscar canciones con buscar_en_spotify.",
    }, null, 2);
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-AGENTES — Cada uno es un especialista con su propia personalidad
// ═══════════════════════════════════════════════════════════════════════════════

const modelo = new BedrockModel({
  modelId: "us.amazon.nova-pro-v1:0",
  region: "us-east-1",
});

const djPersonal = new Agent({
  model: modelo,
  systemPrompt: `Eres un DJ personal experto. Conoces los gustos del usuario.
SIEMPRE usa buscar_en_spotify antes de recomendar. NUNCA inventes datos.
Respondes en español, con onda.`,
  tools: [buscarEnSpotify, buscarCanciones, crearPlaylistEnSpotify, reproducirCancion],
  printer: false,
});

const djEventos = new Agent({
  model: modelo,
  systemPrompt: `Eres un DJ profesional de eventos. Armas playlists para fiestas, bodas, cenas.
SIEMPRE usa buscar_en_spotify. Usa planificar_evento para estructurar la playlist.
Verifica que la duración cubra el evento. Respondes en español.`,
  tools: [buscarEnSpotify, buscarCanciones, crearPlaylistEnSpotify, reproducirCancion, planificarEvento],
  printer: false,
});

const djEmocional = new Agent({
  model: modelo,
  systemPrompt: `Eres un DJ empático especializado en emociones y música.

FLUJO OBLIGATORIO:
1. Usa analizar_emocion para obtener géneros y queries de búsqueda
2. Usa los queries_spotify del resultado para buscar con buscar_en_spotify
3. NUNCA busques la emoción como título
4. Crea una playlist con las canciones encontradas

Eres sensible y no juzgas. Respondes en español con calidez.`,
  tools: [buscarEnSpotify, buscarCanciones, crearPlaylistEnSpotify, reproducirCancion, analizarEmocion],
  printer: false,
});

// ═══════════════════════════════════════════════════════════════════════════════
// TOOLS DEL ORQUESTADOR — Cada sub-agente se expone como un tool
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extrae el texto legible del resultado de un agente.
 */
function extractText(result: any): string {
  // result.lastMessage puede ser: string, Message object, o undefined
  const msg = result?.lastMessage;
  if (!msg) return "(sin respuesta del sub-agente)";
  if (typeof msg === "string") return msg;

  // Message object con content blocks
  if (msg.content && Array.isArray(msg.content)) {
    const texts = msg.content
      .filter((b: any) => b.type === "text" || b.text)
      .map((b: any) => b.text ?? "")
      .filter((t: string) => t.trim().length > 0);
    if (texts.length > 0) return texts.join("\n");
  }

  // Fallback: intentar toString o JSON
  const str = String(msg);
  if (str && str !== "[object Object]") return str;

  // Último recurso: serializar todo el result
  try {
    return JSON.stringify(msg, null, 2);
  } catch {
    return "(no se pudo leer la respuesta del sub-agente)";
  }
}

const consultarDjPersonal = tool({
  name: "consultar_dj_personal",
  description: `Delega al DJ Personal: experto en gustos musicales y recomendaciones personalizadas.
Úsalo cuando el usuario quiera recomendaciones, descubrir música nueva, o reproduzca algo.`,
  inputSchema: z.object({
    mensaje: z.string().describe("El mensaje completo del usuario para el DJ Personal"),
  }),
  callback: async (input) => {
    const result = await djPersonal.invoke(input.mensaje);
    return extractText(result);
  },
});

const consultarDjEventos = tool({
  name: "consultar_dj_eventos",
  description: `Delega al DJ de Eventos: experto en armar playlists para ocasiones específicas.
Úsalo cuando el usuario mencione un evento, fiesta, boda, cena o pida una playlist con duración.`,
  inputSchema: z.object({
    mensaje: z.string().describe("El mensaje completo del usuario para el DJ de Eventos"),
  }),
  callback: async (input) => {
    const result = await djEventos.invoke(input.mensaje);
    return extractText(result);
  },
});

const consultarDjEmocional = tool({
  name: "consultar_dj_emocional",
  description: `Delega al DJ Emocional: experto en música y estados de ánimo.
Úsalo cuando el usuario exprese cómo se siente o quiera música para acompañar un estado de ánimo.`,
  inputSchema: z.object({
    mensaje: z.string().describe("El mensaje completo del usuario para el DJ Emocional"),
  }),
  callback: async (input) => {
    const result = await djEmocional.invoke(input.mensaje);
    return extractText(result);
  },
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
});
await registerColorHooks(orquestador);

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
    await orquestador.invoke(mensaje);
    printAgentEnd();

    askQuestion();
  });
};

askQuestion();
