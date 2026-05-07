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

prompt = "¿Cual fue el último exitó de Queen?"
print(f"\n🎵 Prompt: {prompt}\n")
print("🤖 DJ: ", end="", flush=True)
dj(prompt)
print()
