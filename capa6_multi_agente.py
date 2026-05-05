"""
Capa 6 — Multi-Agente con Orquestador

Nuevo concepto: un agente orquestador que decide a cuál sub-agente delegar.
En vez de un menú manual, el usuario habla con UN solo agente que internamente
decide si la tarea es para el DJ Personal, el DJ de Eventos o el DJ Emocional.

Arquitectura:

    ┌─────────────────────────────────────────────┐
    │         Agente Orquestador                   │
    │  "Soy tu DJ principal. Analizo tu mensaje   │
    │   y decido a quién delegarlo."              │
    │                                              │
    │  Tools:                                      │
    │    - consultar_dj_personal(mensaje)          │
    │    - consultar_dj_eventos(mensaje)           │
    │    - consultar_dj_emocional(mensaje)         │
    └──────────┬──────────────┬───────────────────┘
               │              │              │
               ▼              ▼              ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │ DJ Personal  │ │ DJ Eventos   │ │ DJ Emocional │
    │ (sub-agente) │ │ (sub-agente) │ │ (sub-agente) │
    │ tools: [...]  │ │ tools: [...]  │ │ tools: [...]  │
    └──────────────┘ └──────────────┘ └──────────────┘

El concepto clave: los sub-agentes se exponen como @tool del orquestador.
El orquestador es un agente que usa otros agentes como herramientas.
"""

from strands import Agent, tool
from strands.models import BedrockModel
from strands.session.file_session_manager import FileSessionManager
import json
import os
import time
from dotenv import load_dotenv

# Cargar variables desde .env
load_dotenv()

# ─── Spotify Setup ───────────────────────────────────────────────────────────

try:
    import spotipy
    from spotipy.oauth2 import SpotifyOAuth

    sp = spotipy.Spotify(
        auth_manager=SpotifyOAuth(
            client_id=os.getenv("SPOTIFY_CLIENT_ID"),
            client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
            redirect_uri="http://127.0.0.1:8000/callback",
            scope="playlist-modify-public,playlist-modify-private,user-library-read,user-top-read,user-modify-playback-state,user-read-playback-state",
        ),
        retries=5,
        status_retries=5,
        backoff_factor=0.5,
    )
    SPOTIFY_DISPONIBLE = True
    usuario = sp.current_user()
    SPOTIFY_USER_ID = usuario["id"]
    print(f"✅ Conectado a Spotify como: {usuario['display_name']}")
except Exception as e:
    SPOTIFY_DISPONIBLE = False
    SPOTIFY_USER_ID = None
    print(f"⚠️  Spotify no disponible: {e}")
    print("   Los agentes funcionarán solo con la biblioteca local.\n")


# ─── Biblioteca local ────────────────────────────────────────────────────────

with open("data/canciones.json") as f:
    BIBLIOTECA = json.load(f)


# ═══════════════════════════════════════════════════════════════════════════════
# TOOLS DE SPOTIFY — Compartidos por los sub-agentes
# ═══════════════════════════════════════════════════════════════════════════════

@tool
def buscar_en_spotify(query: str, limite: int = 10) -> str:
    """Busca canciones en Spotify. SIEMPRE úsala antes de responder sobre música.

    Args:
        query: Texto de búsqueda (ej: "Shakira", "rock alternativo")
        limite: Máximo de resultados (default: 10, max: 10)
    """
    if not SPOTIFY_DISPONIBLE:
        return "Spotify no está conectado."
    try:
        limite = min(max(int(limite or 10), 1), 10)
    except (ValueError, TypeError):
        limite = 10
    try:
        resultados = sp.search(q=str(query), type="track", limit=limite)
        tracks = resultados["tracks"]["items"]
        if not tracks:
            return f"No encontré canciones en Spotify para: {query}"
        canciones = []
        for t in tracks:
            canciones.append({
                "titulo": t["name"],
                "artista": t["artists"][0]["name"],
                "album": t["album"]["name"],
                "fecha_lanzamiento": t["album"].get("release_date", "desconocida"),
                "uri": t["uri"],
                "duracion_min": round(t["duration_ms"] / 60000, 1),
            })
        return json.dumps(canciones, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"Error al buscar en Spotify: {str(e)}"


@tool
def buscar_canciones(genero: str = "", mood: str = "", artista: str = "") -> str:
    """Busca canciones en la biblioteca musical LOCAL del usuario.

    Args:
        genero: Género musical (ej: rock, jazz, reggaetón)
        mood: Estado de ánimo (ej: chill, fiesta, melancólico)
        artista: Nombre del artista
    """
    resultados = BIBLIOTECA
    if genero:
        resultados = [c for c in resultados if genero.lower() in c["genero"].lower()]
    if mood:
        resultados = [c for c in resultados if mood.lower() in c["mood"].lower()]
    if artista:
        resultados = [c for c in resultados if artista.lower() in c["artista"].lower()]
    if not resultados:
        return "No encontré canciones con esos criterios en tu biblioteca local."
    return json.dumps(resultados[:10], ensure_ascii=False, indent=2)


@tool
def crear_playlist_en_spotify(nombre: str, descripcion: str, canciones_uris: list) -> str:
    """Crea una playlist en Spotify. Acepta URIs o nombres de canciones.

    Args:
        nombre: Nombre de la playlist
        descripcion: Descripción breve
        canciones_uris: Lista de URIs de Spotify o nombres de canciones
    """
    if not SPOTIFY_DISPONIBLE:
        return "Spotify no está conectado."
    if not canciones_uris:
        return "No me diste canciones."
    if isinstance(canciones_uris, str):
        canciones_uris = [canciones_uris]

    uris_validas = []
    for item in canciones_uris:
        item = str(item).strip()
        if item.startswith("spotify:track:") and len(item.split(":")) == 3:
            uris_validas.append(item)
        else:
            try:
                time.sleep(1)
                r = sp.search(q=item, type="track", limit=1)
                tracks = r["tracks"]["items"]
                if tracks:
                    uris_validas.append(tracks[0]["uri"])
            except Exception:
                pass

    if not uris_validas:
        return "No pude encontrar ninguna de las canciones en Spotify."
    try:
        token = sp.auth_manager.get_access_token(as_dict=False)
        import requests as req
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        body = json.dumps({"name": str(nombre), "public": False, "description": str(descripcion)})
        resp = req.post("https://api.spotify.com/v1/me/playlists", headers=headers, data=body)
        resp.raise_for_status()
        playlist = resp.json()
        for i in range(0, len(uris_validas), 100):
            sp.playlist_add_items(playlist["id"], uris_validas[i:i + 100])
        return json.dumps({
            "status": "ok",
            "mensaje": f"Playlist '{nombre}' creada con {len(uris_validas)} canciones",
            "url": playlist["external_urls"]["spotify"],
            "id": playlist["id"],
        }, ensure_ascii=False)
    except Exception as e:
        return f"Error al crear la playlist: {str(e)}"


@tool
def reproducir_cancion(nombre_cancion: str, artista: str = "") -> str:
    """Reproduce una canción buscándola por nombre en Spotify.

    Args:
        nombre_cancion: Nombre de la canción
        artista: Artista (opcional)
    """
    if not SPOTIFY_DISPONIBLE:
        return "Spotify no está conectado."
    try:
        dispositivos = sp.devices()
        if not dispositivos["devices"]:
            return "No hay dispositivos activos de Spotify. Abre Spotify e intenta de nuevo."
        query = f"track:{nombre_cancion}"
        if artista:
            query += f" artist:{artista}"
        resultados = sp.search(q=query, type="track", limit=5)
        tracks = resultados["tracks"]["items"]
        if not tracks:
            resultados = sp.search(q=f"{nombre_cancion} {artista}".strip(), type="track", limit=5)
            tracks = resultados["tracks"]["items"]
        if not tracks:
            return f"No encontré '{nombre_cancion}' en Spotify."
        track = tracks[0]
        device_id = next((d["id"] for d in dispositivos["devices"] if d["is_active"]), dispositivos["devices"][0]["id"])
        sp.start_playback(device_id=device_id, uris=[track["uri"]])
        return json.dumps({
            "status": "reproduciendo",
            "cancion": track["name"],
            "artista": track["artists"][0]["name"],
            "mensaje": f"▶️ Reproduciendo: {track['name']} — {track['artists'][0]['name']}",
        }, ensure_ascii=False)
    except Exception as e:
        return f"Error al reproducir: {str(e)}"


@tool
def reproducir_playlist(playlist_id: str) -> str:
    """Reproduce una playlist por ID, URI o nombre.

    Args:
        playlist_id: ID, URI o nombre de la playlist
    """
    if not SPOTIFY_DISPONIBLE:
        return "Spotify no está conectado."
    try:
        dispositivos = sp.devices()
        if not dispositivos["devices"]:
            return "No hay dispositivos activos de Spotify. Abre Spotify e intenta de nuevo."
        playlist_id = str(playlist_id).strip()
        if playlist_id.startswith("spotify:playlist:"):
            playlist_uri = playlist_id
        elif len(playlist_id) == 22 and playlist_id.isalnum():
            playlist_uri = f"spotify:playlist:{playlist_id}"
        else:
            playlists = sp.current_user_playlists(limit=50)
            found = None
            for pl in playlists["items"]:
                if playlist_id.lower() in pl["name"].lower():
                    found = pl
                    break
            if not found:
                return f"No encontré la playlist '{playlist_id}'."
            playlist_uri = f"spotify:playlist:{found['id']}"
        device_id = next((d["id"] for d in dispositivos["devices"] if d["is_active"]), dispositivos["devices"][0]["id"])
        sp.start_playback(device_id=device_id, context_uri=playlist_uri)
        pid = playlist_uri.split(":")[-1]
        info = sp.playlist(pid, fields="name,tracks.total")
        return json.dumps({
            "status": "reproduciendo",
            "playlist": info["name"],
            "total_canciones": info["tracks"]["total"],
            "mensaje": f"▶️ Reproduciendo: {info['name']} ({info['tracks']['total']} canciones)",
        }, ensure_ascii=False)
    except Exception as e:
        return f"Error al reproducir playlist: {str(e)}"


@tool
def mis_top_artistas(periodo: str = "medium_term") -> str:
    """Top artistas del usuario en Spotify.

    Args:
        periodo: "short_term", "medium_term" o "long_term"
    """
    if not SPOTIFY_DISPONIBLE:
        return "Spotify no está conectado."
    resultados = sp.current_user_top_artists(limit=10, time_range=periodo)
    return json.dumps([{"nombre": a["name"], "generos": a["genres"][:3]} for a in resultados["items"]], ensure_ascii=False, indent=2)


@tool
def mis_top_canciones(periodo: str = "medium_term") -> str:
    """Top canciones del usuario en Spotify.

    Args:
        periodo: "short_term", "medium_term" o "long_term"
    """
    if not SPOTIFY_DISPONIBLE:
        return "Spotify no está conectado."
    resultados = sp.current_user_top_tracks(limit=10, time_range=periodo)
    return json.dumps([{"titulo": t["name"], "artista": t["artists"][0]["name"], "uri": t["uri"]} for t in resultados["items"]], ensure_ascii=False, indent=2)


@tool
def planificar_evento(tipo_evento: str, tema: str, duracion_horas: float, audiencia: str, energia: str = "media") -> str:
    """Genera un plan musical para un evento.

    Args:
        tipo_evento: Tipo (ej: "fiesta infantil", "boda", "cena")
        tema: Tema (ej: "Batman", "años 80")
        duracion_horas: Duración en horas
        audiencia: Audiencia (ej: "niños 5-10 años")
        energia: "baja", "media" o "alta"
    """
    duracion_min = float(duracion_horas) * 60
    canciones_necesarias = int(duracion_min / 3.5)
    sugerencias = [f"{tema} soundtrack", f"{tema} music", f"{tipo_evento} music"]
    return json.dumps({
        "evento": tipo_evento, "tema": tema,
        "duracion_horas": duracion_horas,
        "canciones_necesarias": canciones_necesarias,
        "sugerencias_busqueda": sugerencias,
    }, ensure_ascii=False, indent=2)


@tool
def analizar_emocion(emocion: str) -> str:
    """Mapea una emoción a géneros musicales y artistas recomendados para buscar en Spotify.

    Devuelve géneros, artistas sugeridos y queries de búsqueda para Spotify.
    IMPORTANTE: Usa los queries devueltos para buscar en Spotify con buscar_en_spotify.

    Args:
        emocion: Estado de ánimo (ej: "triste", "feliz", "ansioso", "motivado")
    """
    mapa = {
        "triste": {
            "generos": ["indie folk", "acoustic", "piano ambient"],
            "artistas_sugeridos": ["Bon Iver", "Sufjan Stevens", "Daughter", "Iron & Wine"],
            "queries_spotify": ["indie folk acoustic", "sad piano instrumental", "melancholic indie"],
            "energia": "baja",
            "consejo": "La música melancólica ayuda a procesar. Aquí van géneros suaves.",
        },
        "feliz": {
            "generos": ["pop", "funk", "disco", "reggae"],
            "artistas_sugeridos": ["Daft Punk", "Bruno Mars", "Pharrell", "Bob Marley"],
            "queries_spotify": ["funk disco groovy", "happy pop hits", "feel good reggae"],
            "energia": "alta",
            "consejo": "¡A celebrar! Funk, disco y pop para mantener la energía.",
        },
        "eufórico": {
            "generos": ["EDM", "house", "techno", "trance"],
            "artistas_sugeridos": ["Avicii", "Calvin Harris", "Tiësto", "David Guetta"],
            "queries_spotify": ["EDM festival hits", "house music energy", "euphoric trance"],
            "energia": "muy alta",
            "consejo": "¡Modo festival! Electrónica pura para bailar.",
        },
        "ansioso": {
            "generos": ["ambient", "lo-fi hip hop", "classical piano", "nature sounds"],
            "artistas_sugeridos": ["Brian Eno", "Nils Frahm", "Ludovico Einaudi", "Tycho"],
            "queries_spotify": ["ambient relaxing", "lo-fi chill beats", "calm piano classical"],
            "energia": "muy baja",
            "consejo": "Respira profundo. Ambient y piano para bajar las revoluciones.",
        },
        "nostálgico": {
            "generos": ["classic rock", "80s pop", "oldies", "bolero"],
            "artistas_sugeridos": ["The Beatles", "Queen", "Fleetwood Mac", "Luis Miguel"],
            "queries_spotify": ["80s classic hits", "classic rock ballads", "oldies gold"],
            "energia": "media",
            "consejo": "Los recuerdos suenan mejor con clásicos.",
        },
        "enamorado": {
            "generos": ["R&B", "soul", "bossa nova", "jazz vocal"],
            "artistas_sugeridos": ["Frank Sinatra", "Norah Jones", "John Legend", "Sade"],
            "queries_spotify": ["romantic R&B soul", "bossa nova love", "jazz vocal romantic"],
            "energia": "media-baja",
            "consejo": "El amor suena a soul, bossa nova y jazz.",
        },
        "enojado": {
            "generos": ["metal", "punk rock", "hard rock", "rap agresivo"],
            "artistas_sugeridos": ["Metallica", "Rage Against the Machine", "System of a Down", "Eminem"],
            "queries_spotify": ["heavy metal aggressive", "punk rock energy", "hard rock anthems"],
            "energia": "muy alta",
            "consejo": "A sacar la energía. Metal y punk para descargar.",
        },
        "motivado": {
            "generos": ["hip-hop", "electronic", "rock alternativo", "pop energético"],
            "artistas_sugeridos": ["Eminem", "Imagine Dragons", "The Killers", "Kanye West"],
            "queries_spotify": ["hip hop motivation", "rock alternativo energético", "workout electronic"],
            "energia": "alta",
            "consejo": "¡Vamos con todo! Hip-hop y rock para el empujón.",
        },
        "relajado": {
            "generos": ["jazz", "lo-fi", "acoustic", "chill electronic"],
            "artistas_sugeridos": ["Miles Davis", "Khruangbin", "Jack Johnson", "Bonobo"],
            "queries_spotify": ["jazz chill smooth", "acoustic relaxing", "chill electronic downtempo"],
            "energia": "baja",
            "consejo": "Modo zen. Jazz y lo-fi para flotar.",
        },
        "concentrado": {
            "generos": ["lo-fi hip hop", "ambient", "post-rock", "minimal"],
            "artistas_sugeridos": ["Explosions in the Sky", "Mogwai", "Tycho", "Boards of Canada"],
            "queries_spotify": ["lo-fi study beats", "post-rock instrumental", "ambient focus"],
            "energia": "baja-media",
            "consejo": "Sin distracciones. Instrumental y ambient para enfocarte.",
        },
    }

    emocion_lower = emocion.lower().strip()
    resultado = None

    # Buscar coincidencia exacta
    if emocion_lower in mapa:
        resultado = mapa[emocion_lower]
    else:
        # Buscar coincidencia parcial
        for key, value in mapa.items():
            if key in emocion_lower or emocion_lower in key:
                resultado = value
                break

    if not resultado:
        resultado = {
            "generos": ["pop", "indie", "alternative"],
            "artistas_sugeridos": ["Coldplay", "The xx", "Tame Impala"],
            "queries_spotify": [f"{emocion} mood music", "indie alternative chill"],
            "energia": "media",
            "consejo": f"No conozco exactamente '{emocion}', pero buscaré algo que encaje.",
        }

    resultado["emocion_detectada"] = emocion
    resultado["instruccion"] = "USA los queries_spotify para buscar canciones con buscar_en_spotify. NO busques la emoción como título."
    return json.dumps(resultado, ensure_ascii=False, indent=2)


# ═══════════════════════════════════════════════════════════════════════════════
# SUB-AGENTES — Cada uno es un especialista con su propia personalidad
# ═══════════════════════════════════════════════════════════════════════════════

modelo = BedrockModel(model_id="us.amazon.nova-pro-v1:0", region_name="us-east-1")

# Los sub-agentes se crean SIN callback_handler para que no impriman a stdout.
# Solo el orquestador imprime al usuario.

dj_personal = Agent(
    model=modelo,
    system_prompt="""Eres un DJ personal experto. Conoces los gustos del usuario.
    SIEMPRE usa buscar_en_spotify antes de recomendar. NUNCA inventes datos.
    Puedes consultar mis_top_artistas y mis_top_canciones para conocer al usuario.
    Respondes en español, con onda.""",
    tools=[buscar_en_spotify, buscar_canciones, crear_playlist_en_spotify,
           reproducir_cancion, reproducir_playlist, mis_top_artistas, mis_top_canciones],
    callback_handler=None,  # Silenciar output — solo el orquestador habla
)

dj_eventos = Agent(
    model=modelo,
    system_prompt="""Eres un DJ profesional de eventos. Armas playlists para fiestas, bodas, cenas.
    SIEMPRE usa buscar_en_spotify. Usa planificar_evento para estructurar la playlist.
    Verifica que la duración cubra el evento. Respondes en español.""",
    tools=[buscar_en_spotify, buscar_canciones, crear_playlist_en_spotify,
           reproducir_cancion, reproducir_playlist, planificar_evento],
    callback_handler=None,
)

dj_emocional = Agent(
    model=modelo,
    system_prompt="""Eres un DJ empático especializado en emociones y música.

    FLUJO OBLIGATORIO:
    1. Usa analizar_emocion para obtener géneros y queries de búsqueda
    2. Usa los queries_spotify del resultado para buscar con buscar_en_spotify
       (ej: si devuelve "jazz chill smooth", busca ESO en Spotify)
    3. NUNCA busques la emoción como título (NO busques "triste" o "ansioso")
    4. Crea una playlist con las canciones encontradas

    Eres sensible y no juzgas. Respondes en español con calidez.""",
    tools=[buscar_en_spotify, buscar_canciones, crear_playlist_en_spotify,
           reproducir_cancion, reproducir_playlist, analizar_emocion],
    callback_handler=None,
)


# ═══════════════════════════════════════════════════════════════════════════════
# TOOLS DEL ORQUESTADOR — Cada sub-agente se expone como un @tool
# ═══════════════════════════════════════════════════════════════════════════════

@tool
def consultar_dj_personal(mensaje: str) -> str:
    """Delega al DJ Personal: experto en gustos musicales y recomendaciones personalizadas.
    Úsalo cuando el usuario quiera recomendaciones, descubrir música nueva,
    o pida algo basado en sus gustos.

    Args:
        mensaje: El mensaje completo del usuario para el DJ Personal
    """
    respuesta = dj_personal(mensaje)
    return str(respuesta)


@tool
def consultar_dj_eventos(mensaje: str) -> str:
    """Delega al DJ de Eventos: experto en armar playlists para ocasiones específicas.
    Úsalo cuando el usuario mencione un evento, fiesta, boda, cena, workout,
    o pida una playlist con duración específica.

    Args:
        mensaje: El mensaje completo del usuario para el DJ de Eventos
    """
    respuesta = dj_eventos(mensaje)
    return str(respuesta)


@tool
def consultar_dj_emocional(mensaje: str) -> str:
    """Delega al DJ Emocional: experto en música y estados de ánimo.
    Úsalo cuando el usuario exprese cómo se siente, mencione emociones,
    o quiera música para acompañar un estado de ánimo.

    Args:
        mensaje: El mensaje completo del usuario para el DJ Emocional
    """
    respuesta = dj_emocional(mensaje)
    return str(respuesta)


# ═══════════════════════════════════════════════════════════════════════════════
# AGENTE ORQUESTADOR — El punto de entrada principal
# ═══════════════════════════════════════════════════════════════════════════════

orquestador = Agent(
    model=modelo,
    system_prompt="""Eres el DJ principal. Tu trabajo es entender qué necesita el usuario
    y delegarlo al sub-agente especializado correcto.

    Tienes 3 DJs especializados disponibles como herramientas:

    1. consultar_dj_personal — Para recomendaciones basadas en gustos, descubrir música,
       "ponme algo", "recomiéndame", "qué hay nuevo de X artista"

    2. consultar_dj_eventos — Para eventos con duración específica: fiestas, bodas, cenas,
       "arma una playlist de 3 horas para una fiesta", "música para mi boda"

    3. consultar_dj_emocional — Para estados de ánimo: "estoy triste", "me siento motivado",
       "necesito música para relajarme", "estoy ansioso"

    También puedes reproducir música directamente:
    - reproducir_cancion — Para reproducir una canción específica por nombre
    - reproducir_playlist — Para reproducir una playlist por nombre o ID

    REGLAS:
    - SIEMPRE delega al sub-agente apropiado para buscar y armar playlists.
    - Pasa el mensaje COMPLETO del usuario al sub-agente.
    - Si no estás seguro, usa consultar_dj_personal como default.
    - Si el usuario pide reproducir algo específico, usa reproducir_cancion o reproducir_playlist directamente.
    - Presenta la respuesta del sub-agente al usuario de forma natural.

    Respondes en español.""",
    tools=[consultar_dj_personal, consultar_dj_eventos, consultar_dj_emocional,
           reproducir_cancion, reproducir_playlist],
)


# ═══════════════════════════════════════════════════════════════════════════════
# INTERFAZ DE CONSOLA
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("\n🎧 DJ Multi-Agente con Orquestador")
    print("=" * 50)
    print("Un solo agente que delega a 3 DJs especializados.")
    print("Solo habla — el orquestador decide a quién preguntar.\n")
    print("Ejemplos:")
    print("  • 'Recomiéndame algo de rock' → DJ Personal")
    print("  • 'Arma una playlist de 2h para una cena' → DJ Eventos")
    print("  • 'Estoy triste, ponme algo' → DJ Emocional")
    print("\nEscribe 'salir' para terminar.\n")

    while True:
        try:
            mensaje = input("🎵 Tú: ").strip()
            if mensaje.lower() in ("salir", "exit", "quit"):
                print("\n👋 ¡Nos vemos! Que suene buena música.")
                break
            if not mensaje:
                continue

            print("\n🎧 DJ: ", end="", flush=True)
            orquestador(mensaje)
            print("\n")

        except KeyboardInterrupt:
            print("\n\n👋 ¡Nos vemos!")
            break
