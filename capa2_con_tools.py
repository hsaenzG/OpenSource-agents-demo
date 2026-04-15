from strands import Agent, tool
from strands.models.ollama import OllamaModel
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

modelo = OllamaModel(model_id="llama3.1", host="http://localhost:11434")

dj = Agent(
    model=modelo,
    system_prompt="""Eres un DJ y curador musical experto.
    Usa la herramienta buscar_canciones para encontrar música en la biblioteca del usuario.
    Siempre basa tus recomendaciones en canciones que el usuario realmente tiene.""",
    tools=[buscar_canciones]
)

dj("Quiero escuchar jazz mientras trabajo")
