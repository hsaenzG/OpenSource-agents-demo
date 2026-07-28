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

/**
 * Recorre el stream del agente y colorea la salida a mano:
 *   - texto de la respuesta en verde (textDelta, conforme va llegando)
 *   - anuncio de herramientas en fucsia (beforeToolCallEvent)
 *
 * El SDK no deja inyectar un Printer custom (la opción `printer` del Agent es
 * boolean, y ni Printer ni AgentPrinter se exportan). Por eso ponemos
 * `printer: false` en el Agent y manejamos nosotros el stream aquí.
 *
 * Devuelve el AgentResult final (el valor de retorno del generador).
 *
 *   const dj = new Agent({ ..., printer: false });
 *   const result = await streamColored(dj, "hola");
 */
export async function streamColored(
  agent: { stream: (message: string) => AsyncGenerator<any, any, unknown> },
  message: string,
): Promise<any> {
  process.stdout.write(`${GREEN}🤖 DJ: `);

  const iterator = agent.stream(message);
  while (true) {
    const { value, done } = await iterator.next();
    if (done) {
      process.stdout.write(`${RESET}\n`);
      return value; // AgentResult
    }

    const event = value as any;

    // Texto de la respuesta, conforme va llegando del modelo
    if (event.type === "modelStreamUpdateEvent") {
      const inner = event.event;
      if (
        inner?.type === "modelContentBlockDeltaEvent" &&
        inner.delta?.type === "textDelta"
      ) {
        process.stdout.write(`${GREEN}${inner.delta.text}`);
      }
      continue;
    }

    // Anuncio de herramienta (beforeToolCallEvent dispara una vez por llamada)
    if (event.type === "beforeToolCallEvent") {
      const name = event.toolUse?.name ?? "desconocida";
      process.stdout.write(
        `\n${MAGENTA}⚙️  Usando herramienta: ${name}${RESET}\n`,
      );
    }
  }
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
