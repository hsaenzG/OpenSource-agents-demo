"""
🎸 DJ Agent — Frontend Streamlit
Estilo: Dev + Rock 🤘
"""

import streamlit as st
import json
import os
import time

# ─── Page Config ──────────────────────────────────────────────────────────────

st.set_page_config(
    page_title="🎸 DJ Agent",
    page_icon="🎸",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ─── Custom CSS — Dark Dev + Rock Theme ───────────────────────────────────────

st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Space+Grotesk:wght@400;500;700&display=swap');

    /* Main background */
    .stApp {
        background: linear-gradient(135deg, #0a0a0a 0%, #1a0a2e 50%, #0d1117 100%);
    }

    /* Sidebar */
    section[data-testid="stSidebar"] {
        background: linear-gradient(180deg, #0d1117 0%, #161b22 100%);
        border-right: 1px solid #ff006620;
    }

    /* Headers */
    h1, h2, h3 {
        font-family: 'Space Grotesk', sans-serif !important;
        background: linear-gradient(90deg, #ff0066, #ff6600, #ffcc00);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }

    /* Chat messages */
    .stChatMessage {
        background: #161b2280 !important;
        border: 1px solid #30363d !important;
        border-radius: 12px !important;
        backdrop-filter: blur(10px);
    }

    /* User message accent */
    [data-testid="stChatMessage"]:has([data-testid="chatAvatarIcon-user"]) {
        border-left: 3px solid #ff0066 !important;
    }

    /* Assistant message accent */
    [data-testid="stChatMessage"]:has([data-testid="chatAvatarIcon-assistant"]) {
        border-left: 3px solid #00ff88 !important;
    }

    /* Chat input */
    .stChatInput > div {
        background: #0d1117 !important;
        border: 1px solid #30363d !important;
        border-radius: 12px !important;
    }

    .stChatInput textarea {
        font-family: 'JetBrains Mono', monospace !important;
        color: #e6edf3 !important;
    }

    .stChatInput textarea::placeholder {
        color: #8b949e !important;
    }

    /* Sidebar text */
    section[data-testid="stSidebar"] .stMarkdown p,
    section[data-testid="stSidebar"] .stMarkdown li {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.85rem;
        color: #8b949e;
    }

    /* Code blocks */
    code {
        font-family: 'JetBrains Mono', monospace !important;
        background: #1a1a2e !important;
        color: #00ff88 !important;
        padding: 2px 6px;
        border-radius: 4px;
    }

    /* Buttons */
    .stButton > button {
        font-family: 'JetBrains Mono', monospace !important;
        background: linear-gradient(135deg, #ff0066, #ff6600) !important;
        color: white !important;
        border: none !important;
        border-radius: 8px !important;
        font-weight: 500 !important;
        transition: all 0.3s ease !important;
    }

    .stButton > button:hover {
        transform: translateY(-2px) !important;
        box-shadow: 0 4px 20px #ff006640 !important;
    }

    /* Metrics */
    [data-testid="stMetric"] {
        background: #161b22;
        border: 1px solid #30363d;
        border-radius: 12px;
        padding: 1rem;
    }

    [data-testid="stMetricValue"] {
        font-family: 'JetBrains Mono', monospace !important;
        color: #ff0066 !important;
    }

    /* Expander */
    .streamlit-expanderHeader {
        font-family: 'JetBrains Mono', monospace !important;
        background: #161b22 !important;
        border: 1px solid #30363d !important;
        border-radius: 8px !important;
    }

    /* Selectbox */
    .stSelectbox > div > div {
        background: #0d1117 !important;
        border: 1px solid #30363d !important;
        border-radius: 8px !important;
        font-family: 'JetBrains Mono', monospace !important;
    }

    /* Radio buttons */
    .stRadio > div {
        font-family: 'JetBrains Mono', monospace !important;
    }

    /* Divider */
    hr {
        border-color: #ff006630 !important;
    }

    /* Scrollbar */
    ::-webkit-scrollbar {
        width: 8px;
    }
    ::-webkit-scrollbar-track {
        background: #0d1117;
    }
    ::-webkit-scrollbar-thumb {
        background: #30363d;
        border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
        background: #ff0066;
    }

    /* Glowing effect for the title */
    .glow-title {
        text-align: center;
        font-size: 3rem;
        font-family: 'Space Grotesk', sans-serif;
        text-shadow: 0 0 10px #ff0066, 0 0 20px #ff0066, 0 0 40px #ff006640;
        margin-bottom: 0;
    }

    .subtitle {
        text-align: center;
        font-family: 'JetBrains Mono', monospace;
        color: #8b949e;
        font-size: 0.9rem;
        margin-top: 0;
    }

    /* Song cards */
    .song-card {
        background: linear-gradient(135deg, #161b22, #1a1a2e);
        border: 1px solid #30363d;
        border-radius: 12px;
        padding: 1rem;
        margin: 0.5rem 0;
        transition: all 0.3s ease;
    }

    .song-card:hover {
        border-color: #ff0066;
        box-shadow: 0 0 15px #ff006620;
    }

    /* Terminal-style output */
    .terminal-output {
        background: #0d1117;
        border: 1px solid #30363d;
        border-radius: 8px;
        padding: 1rem;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.85rem;
        color: #00ff88;
        white-space: pre-wrap;
    }

    /* Animated border */
    @keyframes borderGlow {
        0%, 100% { border-color: #ff0066; }
        33% { border-color: #ff6600; }
        66% { border-color: #ffcc00; }
    }

    .active-glow {
        animation: borderGlow 3s infinite;
    }

    /* Now Playing widget */
    .now-playing {
        background: linear-gradient(135deg, #1a0a2e, #0d1117);
        border: 1px solid #ff0066;
        border-radius: 12px;
        padding: 1rem;
        margin: 0.5rem 0;
        box-shadow: 0 0 20px #ff006620, inset 0 0 20px #ff006610;
    }

    .now-playing-title {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.7rem;
        color: #ff0066;
        text-transform: uppercase;
        letter-spacing: 2px;
        margin-bottom: 0.5rem;
    }

    .now-playing-song {
        font-family: 'Space Grotesk', sans-serif;
        font-size: 1rem;
        color: #e6edf3;
        font-weight: 700;
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .now-playing-artist {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.8rem;
        color: #8b949e;
        margin: 0.2rem 0 0 0;
    }

    .now-playing-album {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.7rem;
        color: #484f58;
        margin: 0.2rem 0 0 0;
        font-style: italic;
    }

    .now-playing-progress {
        margin-top: 0.8rem;
        height: 3px;
        background: #30363d;
        border-radius: 2px;
        overflow: hidden;
    }

    .now-playing-progress-bar {
        height: 100%;
        background: linear-gradient(90deg, #ff0066, #ff6600);
        border-radius: 2px;
        transition: width 1s linear;
    }

    .now-playing-time {
        display: flex;
        justify-content: space-between;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.65rem;
        color: #484f58;
        margin-top: 0.3rem;
    }

    .now-playing-idle {
        background: linear-gradient(135deg, #161b22, #0d1117);
        border: 1px solid #30363d;
        border-radius: 12px;
        padding: 1rem;
        margin: 0.5rem 0;
        text-align: center;
    }

    .eq-bars {
        display: inline-flex;
        align-items: flex-end;
        gap: 2px;
        height: 14px;
        margin-right: 6px;
        vertical-align: middle;
    }

    .eq-bar {
        width: 3px;
        background: #ff0066;
        border-radius: 1px;
        animation: eqBounce 0.8s ease-in-out infinite alternate;
    }

    .eq-bar:nth-child(1) { height: 60%; animation-delay: 0s; }
    .eq-bar:nth-child(2) { height: 100%; animation-delay: 0.2s; }
    .eq-bar:nth-child(3) { height: 40%; animation-delay: 0.4s; }
    .eq-bar:nth-child(4) { height: 80%; animation-delay: 0.1s; }
    .eq-bar:nth-child(5) { height: 50%; animation-delay: 0.3s; }

    @keyframes eqBounce {
        0% { transform: scaleY(0.3); }
        100% { transform: scaleY(1); }
    }
</style>
""", unsafe_allow_html=True)


# ─── Load Data & Agent ────────────────────────────────────────────────────────

@st.cache_data
def load_biblioteca():
    with open("data/canciones.json") as f:
        return json.load(f)


BIBLIOTECA = load_biblioteca()


def get_agent():
    """Initialize the DJ agent (cached in session state)."""
    if "agent" not in st.session_state:
        try:
            from strands import Agent, tool
            from strands.models import BedrockModel

            # Tools
            @tool
            def buscar_canciones(genero: str = "", mood: str = "", artista: str = "") -> str:
                """Busca canciones en la biblioteca musical del usuario.

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
                    return "No encontré canciones con esos criterios en tu biblioteca."
                return json.dumps(resultados[:10], ensure_ascii=False, indent=2)

            @tool
            def analizar_energia(canciones: list) -> str:
                """Analiza el nivel de energía promedio de una lista de canciones.

                Args:
                    canciones: Lista de nombres de canciones a analizar
                """
                energia_map = {}
                for cancion in BIBLIOTECA:
                    energia_map[cancion["titulo"].lower()] = cancion.get("energia", 50)

                analisis = []
                for titulo in canciones:
                    energia = energia_map.get(titulo.lower(), 50)
                    analisis.append({"titulo": titulo, "energia": energia})

                analisis.sort(key=lambda x: x["energia"])
                promedio = sum(c["energia"] for c in analisis) / len(analisis) if analisis else 0

                return json.dumps({
                    "energia_promedio": round(promedio),
                    "flow": "ascendente" if analisis[0]["energia"] < analisis[-1]["energia"] else "descendente",
                    "orden_sugerido": [c["titulo"] for c in analisis],
                    "nota": "Energía baja → alta para ir subiendo el mood" if promedio < 60 else "Playlist con buena energía 🔥"
                }, ensure_ascii=False)

            @tool
            def duracion_playlist(canciones: list) -> str:
                """Calcula la duración total de una playlist.

                Args:
                    canciones: Lista de nombres de canciones
                """
                duracion_map = {}
                for cancion in BIBLIOTECA:
                    duracion_map[cancion["titulo"].lower()] = cancion.get("duracion_min", 3.5)

                total = sum(duracion_map.get(t.lower(), 3.5) for t in canciones)

                return json.dumps({
                    "canciones": len(canciones),
                    "duracion_total_min": round(total, 1),
                    "duracion_formato": f"{int(total // 60)}h {int(total % 60)}min" if total >= 60 else f"{int(total)}min",
                    "sugerencia": "Playlist corta, podrías agregar más canciones" if total < 30 else "Buena duración 🎶"
                }, ensure_ascii=False)

            # Try Spotify tools if available
            tools_list = [buscar_canciones, analizar_energia, duracion_playlist]
            spotify_available = False
            sp = None

            # Get Spotify credentials from session state (user-provided via sidebar)
            spotify_client_id = st.session_state.get("spotify_client_id", "")
            spotify_client_secret = st.session_state.get("spotify_client_secret", "")

            if spotify_client_id and spotify_client_secret:
                try:
                    import spotipy
                    from spotipy.oauth2 import SpotifyOAuth

                    sp = spotipy.Spotify(
                        auth_manager=SpotifyOAuth(
                            client_id=spotify_client_id,
                            client_secret=spotify_client_secret,
                            redirect_uri="http://127.0.0.1:8000/callback",
                            scope="playlist-modify-public,playlist-modify-private,user-library-read,user-top-read,user-modify-playback-state,user-read-playback-state",
                        ),
                        retries=5,
                        status_retries=5,
                        backoff_factor=0.5,
                    )
                    usuario = sp.current_user()
                    spotify_available = True
                    st.session_state["spotify_user"] = usuario["display_name"]
                    st.session_state["sp_client"] = sp
                except Exception as e:
                    spotify_available = False
                    sp = None
                    st.session_state["spotify_error"] = str(e)

            if spotify_available and sp:
                @tool
                def buscar_en_spotify(query: str, limite: int = 10) -> str:
                    """Busca canciones en Spotify por nombre, artista o género.

                    Args:
                        query: Texto de búsqueda
                        limite: Número máximo de resultados (default: 10)
                    """
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
                                "uri": t["uri"],
                                "duracion_min": round(t["duration_ms"] / 60000, 1),
                            })
                        return json.dumps(canciones, ensure_ascii=False, indent=2)
                    except Exception as e:
                        return f"Error al buscar en Spotify: {str(e)}"

                @tool
                def reproducir_cancion(nombre_cancion: str, artista: str = "") -> str:
                    """Reproduce una canción en el dispositivo activo de Spotify del usuario.
                    Busca la canción por nombre en Spotify y la reproduce automáticamente.
                    SIEMPRE usa esta herramienta cuando el usuario pida escuchar, poner o reproducir una canción.

                    Args:
                        nombre_cancion: Nombre de la canción a reproducir
                        artista: Nombre del artista (opcional, ayuda a encontrar la canción correcta)
                    """
                    try:
                        dispositivos = sp.devices()
                        if not dispositivos["devices"]:
                            return "No hay dispositivos activos de Spotify. Abre Spotify en tu celular o computadora e intenta de nuevo."
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
                            "album": track["album"]["name"],
                            "mensaje": f"▶️ Reproduciendo: {track['name']} — {track['artists'][0]['name']}",
                        }, ensure_ascii=False)
                    except Exception as e:
                        error_msg = str(e)
                        if "NO_ACTIVE_DEVICE" in error_msg or "Player command failed" in error_msg:
                            return "No hay dispositivos activos de Spotify. Abre Spotify en tu celular o computadora e intenta de nuevo."
                        return f"Error al reproducir: {error_msg}"

                @tool
                def crear_playlist_en_spotify(nombre: str, descripcion: str, canciones_uris: list) -> str:
                    """Crea una playlist en la cuenta de Spotify del usuario con las canciones indicadas.

                    Args:
                        nombre: Nombre de la playlist
                        descripcion: Descripción breve de la playlist
                        canciones_uris: Lista de URIs de Spotify o nombres de canciones
                    """
                    if not canciones_uris:
                        return "No me diste canciones para agregar a la playlist."
                    if isinstance(canciones_uris, str):
                        canciones_uris = [canciones_uris]
                    uris_validas = []
                    for item in canciones_uris:
                        item = str(item).strip()
                        if item.startswith("spotify:track:") and len(item.split(":")) == 3:
                            uris_validas.append(item)
                        else:
                            try:
                                time.sleep(0.5)
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
                        }, ensure_ascii=False)
                    except Exception as e:
                        return f"Error al crear la playlist: {str(e)}"

                @tool
                def mis_top_artistas(periodo: str = "medium_term") -> str:
                    """Obtiene los artistas más escuchados del usuario en Spotify.

                    Args:
                        periodo: "short_term" (último mes), "medium_term" (6 meses), "long_term" (siempre)
                    """
                    resultados = sp.current_user_top_artists(limit=10, time_range=periodo)
                    return json.dumps([{"nombre": a["name"], "generos": a["genres"][:3]} for a in resultados["items"]], ensure_ascii=False, indent=2)

                @tool
                def mis_top_canciones(periodo: str = "medium_term") -> str:
                    """Obtiene las canciones más escuchadas del usuario en Spotify.

                    Args:
                        periodo: "short_term" (último mes), "medium_term" (6 meses), "long_term" (siempre)
                    """
                    resultados = sp.current_user_top_tracks(limit=10, time_range=periodo)
                    return json.dumps([{"titulo": t["name"], "artista": t["artists"][0]["name"], "uri": t["uri"]} for t in resultados["items"]], ensure_ascii=False, indent=2)

                tools_list = [buscar_canciones, buscar_en_spotify, reproducir_cancion,
                              crear_playlist_en_spotify, mis_top_artistas, mis_top_canciones,
                              analizar_energia, duracion_playlist]

            st.session_state["spotify_available"] = spotify_available

            modelo = BedrockModel(model_id="us.amazon.nova-pro-v1:0", region_name="us-east-1")

            system_prompt = """Eres un DJ personal con acceso TOTAL a Spotify. NO eres un modelo de lenguaje genérico.
            Tienes herramientas reales que controlan Spotify. ÚSALAS SIEMPRE.

            ⚠️ PROHIBICIONES ABSOLUTAS:
            - NUNCA digas "no puedo reproducir", "no tengo la capacidad", "como modelo de lenguaje" o similar.
            - NUNCA sugieras al usuario que haga algo manualmente. TÚ lo haces con tus herramientas.
            - NUNCA inventes información sobre canciones, artistas o URLs.
            - NUNCA respondas sin haber llamado al menos una herramienta primero.

            ✅ LO QUE DEBES HACER:
            1. Si el usuario pide REPRODUCIR algo → llama reproducir_cancion(nombre_cancion="...", artista="...")
            2. Si el usuario pide una PLAYLIST → llama buscar_en_spotify para encontrar canciones, luego crear_playlist_en_spotify con las URIs
            3. Si el usuario pregunta por MÚSICA → llama buscar_en_spotify PRIMERO, luego responde con los datos reales
            4. Si el usuario dice un nombre de canción o "ponme X" → llama reproducir_cancion INMEDIATAMENTE
            5. Para conocer gustos → llama mis_top_artistas o mis_top_canciones

            HERRAMIENTAS (DEBES usarlas, NO son opcionales):
            - buscar_en_spotify(query): busca canciones reales en Spotify
            - reproducir_cancion(nombre_cancion, artista): reproduce en el dispositivo del usuario
            - crear_playlist_en_spotify(nombre, descripcion, canciones_uris): crea playlist real en su cuenta
            - mis_top_artistas(periodo) / mis_top_canciones(periodo): gustos del usuario
            - buscar_canciones(genero, mood, artista): biblioteca local
            - analizar_energia(canciones): analiza energía
            - duracion_playlist(canciones): calcula duración

            Usas emojis de rock (🎸🤘🔥🎵). Respondes en español, con onda."""

            if not spotify_available:
                system_prompt = """Eres un DJ y curador musical experto con actitud rockera.
            Usas emojis de rock (🎸🤘🔥🎵) en tus respuestas.
            Usa tus herramientas para armar playlists basadas en la biblioteca local del usuario.
            Considera el mood, la energía, y la duración para crear una experiencia coherente.
            SIEMPRE usa tus herramientas antes de responder. NUNCA digas que no puedes hacer algo.
            Respondes en español, con onda y personalidad.
            NO tienes acceso a Spotify, solo a la biblioteca local."""

            agent = Agent(
                model=modelo,
                system_prompt=system_prompt,
                tools=tools_list,
                callback_handler=None,
            )
            st.session_state["agent"] = agent
            st.session_state["agent_ready"] = True

        except Exception as e:
            st.session_state["agent_ready"] = False
            st.session_state["agent_error"] = str(e)

    return st.session_state.get("agent")


# ─── Now Playing Helper ───────────────────────────────────────────────────────

def get_now_playing():
    """Get current playback state from Spotify."""
    sp = st.session_state.get("sp_client")
    if not sp:
        return None
    try:
        playback = sp.current_playback()
        if playback and playback.get("item"):
            track = playback["item"]
            progress_ms = playback.get("progress_ms", 0)
            duration_ms = track.get("duration_ms", 1)
            is_playing = playback.get("is_playing", False)

            # Get album art
            album_art = None
            if track.get("album", {}).get("images"):
                album_art = track["album"]["images"][-1]["url"]  # smallest image

            return {
                "song": track["name"],
                "artist": ", ".join(a["name"] for a in track["artists"]),
                "album": track["album"]["name"],
                "album_art": album_art,
                "progress_ms": progress_ms,
                "duration_ms": duration_ms,
                "progress_pct": round((progress_ms / duration_ms) * 100, 1) if duration_ms > 0 else 0,
                "is_playing": is_playing,
            }
        return None
    except Exception:
        return None


def format_ms(ms):
    """Format milliseconds to m:ss."""
    seconds = int(ms / 1000)
    minutes = seconds // 60
    secs = seconds % 60
    return f"{minutes}:{secs:02d}"


# ─── Sidebar ─────────────────────────────────────────────────────────────────

with st.sidebar:
    st.markdown("""
    <div style="text-align: center; padding: 1rem 0;">
        <span style="font-size: 3rem;">🎸</span>
        <h2 style="margin: 0.5rem 0 0 0;">DJ Agent</h2>
        <p style="color: #8b949e; font-family: 'JetBrains Mono', monospace; font-size: 0.75rem;">
            v6.0 // multi-agent // rock edition
        </p>
    </div>
    """, unsafe_allow_html=True)

    st.divider()

    # Status indicators
    st.markdown("#### `> system_status`")

    agent = get_agent()

    if st.session_state.get("agent_ready"):
        st.markdown("🟢 `Agent online`")
    else:
        st.markdown("🔴 `Agent offline`")
        if "agent_error" in st.session_state:
            st.caption(f"Error: {st.session_state['agent_error']}")

    if st.session_state.get("spotify_available"):
        user = st.session_state.get("spotify_user", "unknown")
        st.markdown(f"🟢 `Spotify: {user}`")
    else:
        st.markdown("🟡 `Spotify: no conectado`")

    st.markdown(f"📀 `Biblioteca: {len(BIBLIOTECA)} tracks`")

    st.divider()

    # ─── Spotify Credentials Form ─────────────────────────────────────────────
    if not st.session_state.get("spotify_available"):
        with st.expander("🔑 Conectar Spotify", expanded=not st.session_state.get("agent_ready")):
            st.markdown("""
            <p style="font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; color: #8b949e; line-height: 1.6;">
                Para reproducir música necesitás una app de
                <a href="https://developer.spotify.com/dashboard" target="_blank" style="color: #ff0066;">Spotify Developer</a>.<br>
                Redirect URI: <code>http://127.0.0.1:8000/callback</code>
            </p>
            """, unsafe_allow_html=True)

            client_id = st.text_input(
                "Client ID",
                value=st.session_state.get("spotify_client_id", ""),
                type="password",
                placeholder="tu-spotify-client-id",
                key="input_client_id",
            )
            client_secret = st.text_input(
                "Client Secret",
                value=st.session_state.get("spotify_client_secret", ""),
                type="password",
                placeholder="tu-spotify-client-secret",
                key="input_client_secret",
            )

            if st.button("🔌 Conectar", use_container_width=True, key="btn_connect_spotify"):
                if client_id and client_secret:
                    st.session_state["spotify_client_id"] = client_id
                    st.session_state["spotify_client_secret"] = client_secret
                    # Force agent re-initialization
                    if "agent" in st.session_state:
                        del st.session_state["agent"]
                    if "agent_ready" in st.session_state:
                        del st.session_state["agent_ready"]
                    st.rerun()
                else:
                    st.warning("Ingresá ambos campos")

            if st.session_state.get("spotify_error"):
                st.error(f"Error: {st.session_state['spotify_error']}", icon="⚠️")

        st.divider()
    else:
        # Disconnect button
        if st.button("🔌 Desconectar Spotify", use_container_width=True, key="btn_disconnect"):
            for key in ["spotify_client_id", "spotify_client_secret", "spotify_available",
                        "spotify_user", "sp_client", "agent", "agent_ready", "spotify_error"]:
                st.session_state.pop(key, None)
            st.rerun()

    st.divider()

    # ─── Now Playing Widget (auto-refresh every 5s) ─────────────────────────────
    if st.session_state.get("spotify_available"):

        @st.fragment(run_every=5)
        def now_playing_widget():
            now = get_now_playing()

            if now and now["is_playing"]:
                album_art_html = ""
                if now["album_art"]:
                    album_art_html = f'<img src="{now["album_art"]}" style="width: 100%; border-radius: 8px; margin-bottom: 0.8rem; opacity: 0.9;" />'

                st.markdown(f"""
                <div class="now-playing">
                    <div class="now-playing-title">
                        <span class="eq-bars">
                            <span class="eq-bar"></span>
                            <span class="eq-bar"></span>
                            <span class="eq-bar"></span>
                            <span class="eq-bar"></span>
                            <span class="eq-bar"></span>
                        </span>
                        now playing
                    </div>
                    {album_art_html}
                    <p class="now-playing-song">{now["song"]}</p>
                    <p class="now-playing-artist">{now["artist"]}</p>
                    <p class="now-playing-album">{now["album"]}</p>
                    <div class="now-playing-progress">
                        <div class="now-playing-progress-bar" style="width: {now["progress_pct"]}%"></div>
                    </div>
                    <div class="now-playing-time">
                        <span>{format_ms(now["progress_ms"])}</span>
                        <span>{format_ms(now["duration_ms"])}</span>
                    </div>
                </div>
                """, unsafe_allow_html=True)
            elif now and not now["is_playing"]:
                st.markdown(f"""
                <div class="now-playing-idle">
                    <p style="color: #8b949e; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; margin: 0;">
                        ⏸️ <strong style="color: #e6edf3;">{now["song"]}</strong>
                    </p>
                    <p style="color: #484f58; font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; margin: 0.2rem 0 0 0;">
                        {now["artist"]} — pausado
                    </p>
                </div>
                """, unsafe_allow_html=True)
            else:
                st.markdown("""
                <div class="now-playing-idle">
                    <p style="color: #484f58; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; margin: 0;">
                        🔇 Nada sonando
                    </p>
                    <p style="color: #30363d; font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; margin: 0.2rem 0 0 0;">
                        Pedile al DJ que ponga algo 🤘
                    </p>
                </div>
                """, unsafe_allow_html=True)

        now_playing_widget()
        st.divider()

    # Quick stats
    st.markdown("#### `> biblioteca_stats`")

    generos = {}
    moods = {}
    for c in BIBLIOTECA:
        g = c["genero"]
        m = c["mood"]
        generos[g] = generos.get(g, 0) + 1
        moods[m] = moods.get(m, 0) + 1

    col1, col2 = st.columns(2)
    with col1:
        st.metric("Géneros", len(generos))
    with col2:
        st.metric("Moods", len(moods))

    # Genre breakdown
    with st.expander("🎵 Géneros"):
        for g, count in sorted(generos.items(), key=lambda x: -x[1]):
            bar = "█" * count + "░" * (5 - count)
            st.markdown(f"`{bar}` {g} ({count})")

    with st.expander("🌊 Moods"):
        for m, count in sorted(moods.items(), key=lambda x: -x[1]):
            bar = "█" * count + "░" * (5 - count)
            st.markdown(f"`{bar}` {m} ({count})")

    st.divider()

    # Quick prompts
    st.markdown("#### `> quick_prompts`")

    prompts = [
        "🎸 Rock para programar",
        "🎉 Playlist de fiesta 1h",
        "🌙 Algo chill para la noche",
        "😢 Estoy melancólico",
        "⚡ Máxima energía",
    ]

    for p in prompts:
        if st.button(p, key=f"btn_{p}", use_container_width=True):
            st.session_state["quick_prompt"] = p

    st.divider()

    # Clear chat
    if st.button("🗑️ Limpiar chat", use_container_width=True):
        st.session_state["messages"] = []
        st.rerun()

    st.markdown("""
    <div style="text-align: center; padding: 2rem 0 1rem 0; color: #30363d; font-family: 'JetBrains Mono', monospace; font-size: 0.7rem;">
        built with 🤘 + strands + bedrock
    </div>
    """, unsafe_allow_html=True)


# ─── Main Content ─────────────────────────────────────────────────────────────

# Header
st.markdown("""
<div class="glow-title">🎸 DJ Agent 🤘</div>
<p class="subtitle">// tu DJ personal con IA — estilo dev + rock //</p>
""", unsafe_allow_html=True)

st.markdown("")

# Initialize chat history
if "messages" not in st.session_state:
    st.session_state["messages"] = []

# Display chat messages
for message in st.session_state["messages"]:
    avatar = "🎵" if message["role"] == "user" else "🤖"
    with st.chat_message(message["role"], avatar=avatar):
        st.markdown(message["content"])

# Handle quick prompts
if "quick_prompt" in st.session_state:
    prompt = st.session_state.pop("quick_prompt")
    st.session_state["messages"].append({"role": "user", "content": prompt})
    with st.chat_message("user", avatar="🎵"):
        st.markdown(prompt)

    with st.chat_message("assistant", avatar="🤖"):
        with st.spinner("🎸 Mezclando..."):
            if st.session_state.get("agent_ready"):
                try:
                    response = st.session_state["agent"](prompt)
                    response_text = str(response)
                except Exception as e:
                    response_text = f"⚠️ Error del agente: {str(e)}"
            else:
                response_text = "⚠️ El agente no está disponible. Verifica la conexión con Bedrock."
        st.markdown(response_text)
    st.session_state["messages"].append({"role": "assistant", "content": response_text})
    st.rerun()

# Chat input
if prompt := st.chat_input("Pedí tu playlist, buscá una canción, o decime cómo te sentís... 🎸"):
    st.session_state["messages"].append({"role": "user", "content": prompt})
    with st.chat_message("user", avatar="🎵"):
        st.markdown(prompt)

    with st.chat_message("assistant", avatar="🤖"):
        with st.spinner("🎸 Mezclando..."):
            if st.session_state.get("agent_ready"):
                try:
                    response = st.session_state["agent"](prompt)
                    response_text = str(response)
                except Exception as e:
                    response_text = f"⚠️ Error del agente: {str(e)}"
            else:
                response_text = "⚠️ El agente no está disponible. Verifica la conexión con Bedrock."
        st.markdown(response_text)
    st.session_state["messages"].append({"role": "assistant", "content": response_text})
    st.rerun()

# Welcome message if no chat history
if not st.session_state["messages"]:
    st.markdown("""
    <div style="
        background: linear-gradient(135deg, #161b22, #1a1a2e);
        border: 1px solid #30363d;
        border-radius: 16px;
        padding: 2rem;
        margin: 2rem auto;
        max-width: 700px;
        text-align: center;
    ">
        <p style="font-size: 4rem; margin: 0;">🎧</p>
        <h3 style="font-family: 'Space Grotesk', sans-serif; margin: 1rem 0 0.5rem 0;">
            ¿Qué escuchamos hoy?
        </h3>
        <p style="color: #8b949e; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; line-height: 1.8;">
            Soy tu DJ personal con IA. Puedo:<br>
            <code>→</code> Armar playlists por mood, género o energía<br>
            <code>→</code> Analizar el flow de tus canciones<br>
            <code>→</code> Buscar en tu biblioteca local (o en Spotify)<br>
            <code>→</code> Sugerir música según cómo te sentís
        </p>
        <p style="color: #30363d; font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; margin-top: 1.5rem;">
            // escribí algo abajo o usá los quick prompts del sidebar //
        </p>
    </div>
    """, unsafe_allow_html=True)
