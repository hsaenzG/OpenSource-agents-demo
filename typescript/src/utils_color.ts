/**
 * 🎨 Utilidades de color para el DJ Agent
 *
 * Colores en terminal (ANSI):
 *   - Verde: respuesta del agente
 *   - Amarillo: prompt del usuario
 *   - Fucsia + ⚙️: uso de herramientas
 */

// ─── ANSI Color Codes ─────────────────────────────────────────────────────────

export const GREEN = "\x1b[92m";
export const YELLOW = "\x1b[93m";
export const MAGENTA = "\x1b[95m";
export const RESET = "\x1b[0m";
export const BOLD = "\x1b[1m";

export function printPrompt(prompt: string): void {
  console.log(`\n${YELLOW}🎵 Prompt: ${prompt}${RESET}\n`);
}

export function printAgentPrefix(): void {
  process.stdout.write(`${GREEN}🤖 DJ: `);
}

export function printAgentEnd(): void {
  console.log(`${RESET}`);
}

/**
 * Color printer para Strands Agents SDK (TypeScript).
 * Imprime texto del agente en verde y tool calls en fucsia.
 *
 * Se pasa como `printer` al Agent:
 *   new Agent({ ..., printer: colorPrinter })
 */
export const colorPrinter = {
  write(text: string): void {
    process.stdout.write(`${GREEN}${text}${RESET}`);
  },
};

/**
 * Registra hooks de color en un agente para mostrar tool calls en fucsia.
 * Llámalo después de crear el agente:
 *   const dj = new Agent({ ... });
 *   registerColorHooks(dj);
 */
export async function registerColorHooks(agent: any): Promise<void> {
  const { BeforeToolCallEvent, AfterToolCallEvent } = await import("@strands-agents/sdk");
  let lastTool = "";

  agent.addHook(BeforeToolCallEvent, (event: any) => {
    const toolName = event?.toolUse?.name ?? "unknown";
    if (lastTool !== toolName) {
      lastTool = toolName;
      process.stdout.write(`\n${MAGENTA}⚙️  Usando herramienta: ${toolName}${RESET}\n`);
    }
  });

  agent.addHook(AfterToolCallEvent, () => {
    lastTool = "";
  });
}

/**
 * Helper para invocar un agente manejando el error de stream incompleto
 * que ocurre con Ollama via ai-sdk-ollama (finish_reason no reconocido por Strands).
 */
export async function safeInvoke(
  agent: { invoke: (msg: string) => Promise<any> },
  message: string
): Promise<any> {
  try {
    return await agent.invoke(message);
  } catch (error: any) {
    if (error.message?.includes("Stream ended without completing")) {
      return { lastMessage: "" };
    }
    throw error;
  }
}
