from strands import Agent
from strands.models.ollama import OllamaModel
from utils_color import color_callback_handler, print_prompt, print_agent_prefix, print_agent_end

modelo = OllamaModel(
    model_id="llama3.1",
    host="http://localhost:11434",
)

dj = Agent(
     model=modelo,
     callback_handler=color_callback_handler,
     system_prompt="""Eres un DJ y curador musical experto.
     Respondes en español, con onda y buen gusto.
     Recomiendas música basándote en el mood, la ocasión, y los gustos del usuario."""
)

prompt = "¿Cual fue el último exitó de Queen?"
print_prompt(prompt)
print_agent_prefix()
dj(prompt)
print_agent_end()


