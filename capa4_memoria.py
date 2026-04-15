from strands import Agent, tool
from strands.models.ollama import OllamaModel
from strands.session.file_session_manager import FileSessionManager
import json

# Cargar biblioteca local de canciones
with open("data/canciones.json") as f:
    BIBLIOTECA = json.load(f)

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
    """Analiza el nivel de energía promedio de una lista de canciones y sugiere el orden ideal.
    
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
    }, ensure_ascii=False)

@tool
def duracion_playlist(canciones: list) -> str:
    """Calcula la duración total de una playlist y sugiere si necesita más canciones.
    
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
        "sugerencia": "Playlist corta, podrías agregar más canciones" if total < 30 else "Buena duración"
    }, ensure_ascii=False)

modelo = OllamaModel(model_id="llama3.1", host="http://localhost:11434")

session_manager = FileSessionManager(session_id="usuario-1", storage_dir="./sesiones")

dj = Agent(
    model=modelo,
    system_prompt="""Eres un DJ y curador musical experto.
    Recuerdas los gustos del usuario entre conversaciones.
    Si el usuario ya te dijo qué le gusta, úsalo para personalizar tus playlists.
    Usa tus herramientas para buscar en la biblioteca real del usuario.""",
    tools=[buscar_canciones, analizar_energia, duracion_playlist],
    session_manager=session_manager,
)

# Primera conversación
print("=== Primera conversación ===")
dj("Me encanta el indie rock y el shoegaze. No soporto el reggaetón.")

print("\n\n=== Segunda conversación ===")
# El agente debería recordar los gustos
dj("Armame algo para el viernes")
