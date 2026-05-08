"""
Capa 5 — Conexión con Spotify

Nuevo concepto: herramientas que se conectan a APIs externas.
El agente ahora puede buscar canciones REALES en Spotify y crear playlists
directamente en tu cuenta.

Requisitos:
  1. Crear una app en https://developer.spotify.com/dashboard
  2. Agregar http://127.0.0.1:8000/callback como Redirect URI
  3. Crear un archivo .env en la raíz del proyecto con:
     SPOTIFY_CLIENT_ID=tu-client-id
     SPOTIFY_CLIENT_SECRET=tu-client-secret
  4. pip install spotipy python-dotenv
"""

from strands import Agent, tool
from strands.models import BedrockModel
from strands.session.file_session_manager import FileSessionManager
import json
import os
import time
from dotenv import load_dotenv

# Cargar variables desde .env (SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET)
load_dotenv()

# ─── Spotify Setup ───────────────────────────────────────────────────────────
# La primera vez que corras el script, se abrirá el navegador para autorizar.
# Después, el token se cachea automáticamente.

try:
    import spotipy
    from spotipy.oauth2 import SpotifyOAuth

    sp = spotipy.Spotify(
        auth_manager=SpotifyOAuth(
            client_id=os.getenv("SPOTIFY_CLIENT_ID"),
            client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
            redirect_uri="http://127.0.0.1:8000/callback",
            scope="playlist-modify-public,playlist-modify-private,user-library-read,user-read-recently-played,user-top-read,user-modify-playback-state,user-read-playback-state",
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
    print("   El agente funcionará solo con la biblioteca local.\n")


# ─── Biblioteca local (fallback) ─────────────────────────────────────────────

with open("data/canciones.json") as f:
    BIBLIOTECA = json.load(f)


# ─── Tools ────────────────────────────────────────────────────────────────────

@tool
def buscar_en_spotify(query: str, limite: int = 10) -> str:
    """Busca canciones en Spotify por nombre, artista o género.
    SIEMPRE usa esta herramienta cuando el usuario pregunte por canciones, artistas o música.
    Los resultados son datos REALES y actualizados de Spotify.

    Args:
        query: Texto de búsqueda (ej: "Shakira", "rock alternativo", "Bad Bunny último")
        limite: Número máximo de resultados (default: 10)
    """
    if not SPOTIFY_DISPONIBLE:
        return "Spotify no está conectado. Usa buscar_canciones para la biblioteca local."

    try:
        limite = int(limite) if limite else 10
        limite = min(max(limite, 1), 10)
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
                "popularidad": t.get("popularity", 0),
            })

        return json.dumps(canciones, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"Error al buscar en Spotify: {str(e)}"


@tool
def buscar_canciones(genero: str = "", mood: str = "", artista: str = "") -> str:
    """Busca canciones en la biblioteca musical LOCAL del usuario.

    Args:
        genero: Género musical (ej: rock, jazz, reggaetón, electrónica)
        mood: Estado de ánimo o energía (ej: chill, fiesta, melancólico, energético)
        artista: Nombre del artista o banda
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
    """Crea una playlist en la cuenta de Spotify del usuario con las canciones indicadas.

    Args:
        nombre: Nombre de la playlist (ej: "Viernes de Rock", "Cena Romántica")
        descripcion: Descripción breve de la playlist
        canciones_uris: Lista de URIs de Spotify (ej: ["spotify:track:xxx", ...]) o nombres de canciones
    """
    if not SPOTIFY_DISPONIBLE:
        return "Spotify no está conectado. No puedo crear la playlist."

    if not canciones_uris:
        return "No me diste canciones para agregar a la playlist."

    # Asegurar que es una lista
    if isinstance(canciones_uris, str):
        canciones_uris = [canciones_uris]

    # Validar y resolver URIs — si no es una URI válida, buscar la canción
    uris_validas = []
    for item in canciones_uris:
        item = str(item).strip()
        if item.startswith("spotify:track:") and len(item.split(":")) == 3:
            uris_validas.append(item)
        else:
            # No es una URI válida, buscar la canción por nombre
            try:
                time.sleep(1)  # Evitar rate limiting de Spotify
                r = sp.search(q=item, type="track", limit=1)
                tracks = r["tracks"]["items"]
                if tracks:
                    uris_validas.append(tracks[0]["uri"])
            except Exception:
                pass  # Ignorar canciones que no se encuentran

    if not uris_validas:
        return "No pude encontrar ninguna de las canciones indicadas en Spotify."

    try:
        token = sp.auth_manager.get_access_token(as_dict=False)
        import requests as req
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        body = json.dumps({"name": str(nombre), "public": False, "description": str(descripcion)})
        resp = req.post("https://api.spotify.com/v1/me/playlists", headers=headers, data=body)
        resp.raise_for_status()
        playlist = resp.json()

        for i in range(0, len(uris_validas), 100):
            batch = uris_validas[i:i + 100]
            sp.playlist_add_items(playlist["id"], batch)

        return json.dumps({
            "status": "ok",
            "mensaje": f"Playlist '{nombre}' creada con {len(uris_validas)} canciones",
            "url": playlist["external_urls"]["spotify"],
            "id": playlist["id"],
        }, ensure_ascii=False)
    except Exception as e:
        return f"Error al crear la playlist: {str(e)}"


@tool
def mis_top_artistas(periodo: str = "medium_term") -> str:
    """Obtiene los artistas más escuchados del usuario en Spotify.

    Args:
        periodo: Rango de tiempo - "short_term" (último mes), "medium_term" (6 meses), "long_term" (siempre)
    """
    if not SPOTIFY_DISPONIBLE:
        return "Spotify no está conectado."

    resultados = sp.current_user_top_artists(limit=10, time_range=periodo)
    artistas = []
    for a in resultados["items"]:
        artistas.append({
            "nombre": a["name"],
            "generos": a["genres"][:3],
            "popularidad": a["popularity"],
        })

    return json.dumps(artistas, ensure_ascii=False, indent=2)


@tool
def mis_top_canciones(periodo: str = "medium_term") -> str:
    """Obtiene las canciones más escuchadas del usuario en Spotify.

    Args:
        periodo: Rango de tiempo - "short_term" (último mes), "medium_term" (6 meses), "long_term" (siempre)
    """
    if not SPOTIFY_DISPONIBLE:
        return "Spotify no está conectado."

    resultados = sp.current_user_top_tracks(limit=20, time_range=periodo)
    canciones = []
    for t in resultados["items"]:
        canciones.append({
            "titulo": t["name"],
            "artista": t["artists"][0]["name"],
            "uri": t["uri"],
        })

    return json.dumps(canciones, ensure_ascii=False, indent=2)


@tool
def reproducir_cancion(nombre_cancion: str, artista: str = "") -> str:
    """Reproduce una canción en el dispositivo activo de Spotify del usuario.
    Busca la canción por nombre en Spotify y la reproduce automáticamente.

    Requiere que Spotify esté abierto en algún dispositivo (celular, computadora, etc.).

    Args:
        nombre_cancion: Nombre de la canción a reproducir (ej: "Bohemian Rhapsody", "Despacito")
        artista: Nombre del artista (opcional, ayuda a encontrar la canción correcta)
    """
    if not SPOTIFY_DISPONIBLE:
        return "Spotify no está conectado. No puedo reproducir música."

    try:
        # Verificar dispositivos activos
        dispositivos = sp.devices()
        if not dispositivos["devices"]:
            return ("No hay dispositivos activos de Spotify. "
                    "Abre Spotify en tu celular o computadora e intenta de nuevo.")

        # Buscar la canción en Spotify para obtener la URI real
        query = f"track:{nombre_cancion}"
        if artista:
            query += f" artist:{artista}"
        resultados = sp.search(q=query, type="track", limit=5)
        tracks = resultados["tracks"]["items"]

        # Si no encuentra con búsqueda estricta, intentar búsqueda libre
        if not tracks:
            query_libre = f"{nombre_cancion} {artista}".strip()
            resultados = sp.search(q=query_libre, type="track", limit=5)
            tracks = resultados["tracks"]["items"]

        if not tracks:
            return f"No encontré '{nombre_cancion}' en Spotify. Intenta con otro nombre o verifica la ortografía."

        track = tracks[0]

        # Buscar dispositivo activo, o activar el primero disponible
        device_id = None
        for dev in dispositivos["devices"]:
            if dev["is_active"]:
                device_id = dev["id"]
                break
        if not device_id:
            device_id = dispositivos["devices"][0]["id"]

        sp.start_playback(device_id=device_id, uris=[track["uri"]])

        return json.dumps({
            "status": "reproduciendo",
            "cancion": track["name"],
            "artista": track["artists"][0]["name"],
            "album": track["album"]["name"],
            "uri": track["uri"],
            "mensaje": f"▶️ Reproduciendo: {track['name']} — {track['artists'][0]['name']}",
        }, ensure_ascii=False)
    except Exception as e:
        error_msg = str(e)
        if "NO_ACTIVE_DEVICE" in error_msg or "Player command failed" in error_msg:
            return ("No hay dispositivos activos de Spotify. "
                    "Abre Spotify en tu celular o computadora e intenta de nuevo.")
        return f"Error al reproducir: {error_msg}"


@tool
def reproducir_playlist(playlist_id: str) -> str:
    """Reproduce una playlist completa en el dispositivo activo de Spotify del usuario.

    Requiere que Spotify esté abierto en algún dispositivo (celular, computadora, etc.).

    Args:
        playlist_id: ID, URI o nombre de la playlist de Spotify
    """
    if not SPOTIFY_DISPONIBLE:
        return "Spotify no está conectado. No puedo reproducir música."

    try:
        dispositivos = sp.devices()
        if not dispositivos["devices"]:
            return ("No hay dispositivos activos de Spotify. "
                    "Abre Spotify en tu celular o computadora e intenta de nuevo.")

        # Resolver el playlist_id a una URI válida
        playlist_id = str(playlist_id).strip()

        if playlist_id.startswith("spotify:playlist:"):
            playlist_uri = playlist_id
        elif len(playlist_id) == 22 and playlist_id.isalnum():
            # Parece un ID de Spotify (22 caracteres alfanuméricos)
            playlist_uri = f"spotify:playlist:{playlist_id}"
        else:
            # Probablemente es un nombre — buscar en las playlists del usuario
            playlists = sp.current_user_playlists(limit=50)
            found = None
            for pl in playlists["items"]:
                if pl["name"].lower() == playlist_id.lower():
                    found = pl
                    break
            if not found:
                # Buscar coincidencia parcial
                for pl in playlists["items"]:
                    if playlist_id.lower() in pl["name"].lower():
                        found = pl
                        break
            if not found:
                return f"No encontré la playlist '{playlist_id}' en tu cuenta de Spotify."
            playlist_uri = f"spotify:playlist:{found['id']}"

        # Buscar dispositivo activo o usar el primero disponible
        device_id = None
        for dev in dispositivos["devices"]:
            if dev["is_active"]:
                device_id = dev["id"]
                break
        if not device_id:
            device_id = dispositivos["devices"][0]["id"]

        sp.start_playback(device_id=device_id, context_uri=playlist_uri)
        pid = playlist_uri.split(":")[-1]
        playlist_info = sp.playlist(pid, fields="name,tracks.total")
        return json.dumps({
            "status": "reproduciendo",
            "playlist": playlist_info["name"],
            "total_canciones": playlist_info["tracks"]["total"],
            "mensaje": f"▶️ Reproduciendo playlist: {playlist_info['name']} ({playlist_info['tracks']['total']} canciones)",
        }, ensure_ascii=False)
    except Exception as e:
        error_msg = str(e)
        if "NO_ACTIVE_DEVICE" in error_msg or "Player command failed" in error_msg:
            return ("No hay dispositivos activos de Spotify. "
                    "Abre Spotify en tu celular o computadora e intenta de nuevo.")
        return f"Error al reproducir playlist: {error_msg}"


@tool
def obtener_recomendaciones_spotify(artistas_semilla: list = None, generos_semilla: list = None, tracks_semilla: list = None, limite: int = 20) -> str:
    """Obtiene recomendaciones personalizadas de Spotify basadas en semillas.

    Args:
        artistas_semilla: Lista de IDs de artistas de Spotify (máx 5 entre todas las semillas)
        generos_semilla: Lista de géneros (ej: ["rock", "indie", "jazz"])
        tracks_semilla: Lista de IDs de tracks de Spotify
        limite: Número de recomendaciones (default: 20)
    """
    if not SPOTIFY_DISPONIBLE:
        return "Spotify no está conectado."

    if not artistas_semilla and not generos_semilla and not tracks_semilla:
        return "Necesito al menos una semilla (artista, género o track) para recomendar."

    try:
        resultados = sp.recommendations(
            seed_artists=artistas_semilla,
            seed_genres=generos_semilla,
            seed_tracks=tracks_semilla,
            limit=limite,
        )

        canciones = []
        for t in resultados["tracks"]:
            canciones.append({
                "titulo": t["name"],
                "artista": t["artists"][0]["name"],
                "uri": t["uri"],
                "duracion_min": round(t["duration_ms"] / 60000, 1),
            })

        return json.dumps(canciones, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"Error al obtener recomendaciones: {str(e)}"


# ─── Agente ───────────────────────────────────────────────────────────────────

modelo = BedrockModel(model_id="us.amazon.nova-pro-v1:0", region_name="us-east-1")


def crear_session_manager(session_id: str, storage_dir: str = "./sesiones") -> FileSessionManager:
    """Crea un FileSessionManager que funciona tanto si la sesión es nueva como si ya existe."""
    session_path = os.path.join(storage_dir, f"session_{session_id}")
    session_file = os.path.join(session_path, "session.json")

    # Si el directorio existe pero no tiene session.json, limpiarlo
    if os.path.exists(session_path) and not os.path.exists(session_file):
        import shutil
        shutil.rmtree(session_path)

    return FileSessionManager(session_id=session_id, storage_dir=storage_dir)


session_manager = crear_session_manager("usuario-1")

dj = Agent(
    model=modelo,
    system_prompt="""Eres un DJ personal conectado a Spotify. Controlas la música del usuario.

    REGLAS OBLIGATORIAS:
    1. NUNCA inventes información sobre canciones, artistas, álbumes o URLs.
    2. NUNCA generes links de Spotify en texto. Los links no funcionan.
    3. Para cualquier pregunta sobre música: llama buscar_en_spotify PRIMERO.
    4. Para reproducir música: SIEMPRE llama reproducir_cancion con el nombre de la canción.
       Ejemplo: si el usuario dice "ponme Despacito" → llama reproducir_cancion(nombre_cancion="Despacito", artista="Luis Fonsi")
    5. Para crear playlists: llama crear_playlist_en_spotify con las URIs de los resultados de búsqueda.
    6. Basa TODAS tus respuestas en los datos que devuelven las herramientas.
    7. Si el usuario dice solo un nombre de canción o "reproduce X", SIEMPRE usa reproducir_cancion.

    Herramientas disponibles:
    - buscar_en_spotify: busca canciones reales en Spotify
    - reproducir_cancion: reproduce una canción por nombre (busca automáticamente en Spotify)
    - reproducir_playlist: reproduce una playlist por nombre o ID
    - crear_playlist_en_spotify: crea una playlist nueva
    - mis_top_artistas / mis_top_canciones: consulta gustos del usuario
    - obtener_recomendaciones_spotify: pide recomendaciones a Spotify
    - buscar_canciones: busca en la biblioteca local

    Respondes en español, con onda y buen gusto musical.""",
    tools=[
        buscar_en_spotify,
        buscar_canciones,
        crear_playlist_en_spotify,
        reproducir_cancion,
        reproducir_playlist,
        mis_top_artistas,
        mis_top_canciones,
        obtener_recomendaciones_spotify,
    ],
    session_manager=session_manager,
)


# ─── Conversación interactiva ────────────────────────────────────────────────

if __name__ == "__main__":
    print("\n🎧 DJ Personal con Spotify")
    print("=" * 50)
    print("Escribe tu mensaje (o 'salir' para terminar)\n")

    while True:
        try:
            mensaje = input("🎵 Tú: ").strip()
            if mensaje.lower() in ("salir", "exit", "quit"):
                print("\n👋 ¡Nos vemos! Que suene buena música.")
                break
            if not mensaje:
                continue

            print(f"\n🤖 DJ: ", end="", flush=True)
            dj(mensaje)
            print("\n")

        except KeyboardInterrupt:
            print("\n\n👋 ¡Nos vemos!")
            break
