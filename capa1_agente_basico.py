from strands import Agent
from strands.models.ollama import OllamaModel

modelo = OllamaModel(
    model_id="llama3.1",
    host="http://localhost:11434",
)

dj = Agent(
    model=modelo,
    system_prompt="""Eres un DJ y curador musical experto.
    Respondes en español, con onda y buen gusto.
    Recomiendas música basándote en el mood, la ocasión, y los gustos del usuario."""
)

dj("Recomiéndame algo para escuchar mientras programo")
