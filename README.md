# 🎧 DJ Agent — Agente de IA desde cero

Un agente de IA que actúa como DJ y curador musical, construido con Python, [Strands Agents](https://github.com/strands-agents/sdk-python?trk=b4df06f7-1a05-4faf-a488-43ff27da389d&sc_channel=el) y [Ollama](https://ollama.com/). Todo open source, local y gratis.

Basado en el artículo: [Cómo crear un agente de IA desde cero — open source, local y gratis](https://builder.aws.com/content/3CM7pfa65G4sfLy1X1J0a3aIxPC/como-crear-un-agente-de-ia-desde-cero-open-source-local-y-gratis?trk=b4df06f7-1a05-4faf-a488-43ff27da389d&sc_channel=el)

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

- [Documentación de Strands Agents](https://strandsagents.com?trk=b4df06f7-1a05-4faf-a488-43ff27da389d&sc_channel=el)
- [Repo de Strands en GitHub](https://github.com/strands-agents/sdk-python?trk=b4df06f7-1a05-4faf-a488-43ff27da389d&sc_channel=el) — Apache 2.0
- [Community tools](https://github.com/strands-agents/tools?trk=b4df06f7-1a05-4faf-a488-43ff27da389d&sc_channel=el)
- [Ollama](https://ollama.com/)
