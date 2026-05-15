"""
🎨 Utilidades de color para el DJ Agent

Colores en terminal (ANSI):
  - Verde: respuesta del agente
  - Amarillo: prompt del usuario
  - Fucsia + ⚙️: uso de herramientas
"""

# ─── ANSI Color Codes ─────────────────────────────────────────────────────────

GREEN = "\033[92m"
YELLOW = "\033[93m"
MAGENTA = "\033[95m"
RESET = "\033[0m"
BOLD = "\033[1m"


def print_prompt(prompt: str):
    """Imprime el prompt del usuario en amarillo."""
    print(f"\n{YELLOW}🎵 Prompt: {prompt}{RESET}\n")


def print_agent_prefix():
    """Imprime el prefijo del agente en verde (sin newline)."""
    print(f"{GREEN}🤖 DJ: ", end="", flush=True)


def print_agent_end():
    """Cierra el color verde del agente."""
    print(f"{RESET}")


# ─── Callback Handler con colores para Strands ───────────────────────────────

def color_callback_handler(**kwargs):
    """Callback handler que colorea la salida del agente en la terminal.

    - Texto del agente: verde
    - Uso de herramientas: azul con ⚙️
    """
    # Streaming text del modelo → verde
    if "data" in kwargs:
        print(f"{GREEN}{kwargs['data']}{RESET}", end="", flush=True)

    # Uso de herramienta → fucsia con ⚙️
    if "current_tool_use" in kwargs and kwargs["current_tool_use"].get("name"):
        tool_name = kwargs["current_tool_use"]["name"]
        # Solo imprimir si es un nuevo tool_use (evitar duplicados)
        if not hasattr(color_callback_handler, "_last_tool") or color_callback_handler._last_tool != tool_name:
            color_callback_handler._last_tool = tool_name
            print(f"\n{MAGENTA}⚙️  Usando herramienta: {tool_name}{RESET}", flush=True)

    # Reset del tracking cuando termina un ciclo
    if kwargs.get("complete") or "result" in kwargs:
        color_callback_handler._last_tool = None


# Inicializar atributo
color_callback_handler._last_tool = None
