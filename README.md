# 🎧 DJ Agent — Agente de IA desde cero

Un agente de IA que actúa como DJ y curador musical, construido con Python, [Strands Agents](https://github.com/strands-agents/sdk-python) y [Ollama](https://ollama.com/). Todo open source, local y gratis.

Basado en el artículo: [Cómo crear un agente de IA desde cero — open source, local y gratis](Cómo%20crear%20un%20agente%20de%20IA%20desde%20cero%20-%20open%20source%2C%20local%20y%20gratis.md)

## Requisitos

- macOS / Linux / Windows
- Python 3.10+
- [Ollama](https://ollama.com/)

## Guía paso a paso

### 1. Instalar Ollama

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh
```

### 2. Descargar el modelo

```bash
ollama pull llama3.1
```

### 3. Levantar el servidor

```bash
ollama serve
```

> Si instalaste la app de macOS, el servidor ya corre en segundo plano.

### 4. Crear el entorno Python

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install 'strands-agents[ollama]'
```

### 5. Ejecutar las capas

Cada archivo representa una capa incremental del agente:

| Archivo | Capa | Qué hace |
|---|---|---|
| `capa1_agente_basico.py` | 1 — Solo habla | Modelo + prompt, sin herramientas |
| `capa2_con_tools.py` | 2 — Búsqueda | Busca canciones en tu biblioteca local |
| `capa3_multi_tools.py` | 3 — Multi-tools | Busca, analiza energía y calcula duración |
| `capa4_memoria.py` | 4 — Memoria | Recuerda gustos entre conversaciones |

```bash
python capa1_agente_basico.py
python capa2_con_tools.py
python capa3_multi_tools.py
python capa4_memoria.py
```

## Estructura del proyecto

```
.
├── README.md
├── data/
│   └── canciones.json          # Biblioteca musical (30 canciones)
├── capa1_agente_basico.py      # Agente básico
├── capa2_con_tools.py          # Agente + búsqueda
├── capa3_multi_tools.py        # Agente + múltiples herramientas
├── capa4_memoria.py            # Agente + memoria persistente
└── sesiones/                   # Sesiones guardadas (generado automáticamente)
```

## Recursos

- [Documentación de Strands Agents](https://strandsagents.com/)
- [Repo de Strands en GitHub](https://github.com/strands-agents/sdk-python) — Apache 2.0
- [Community tools](https://github.com/strands-agents/tools)
- [Ollama](https://ollama.com/)
