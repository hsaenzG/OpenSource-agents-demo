/**
 * Spotify OAuth Flow — Autenticación con usuario completo.
 *
 * Levanta un mini servidor HTTP en puerto 8000 para capturar el callback de Spotify.
 * La primera vez abre el navegador para autorizar. Después cachea el token en .spotify_token.json.
 *
 * Todo el intercambio con Spotify se hace con fetch nativo, sin librerías externas.
 */

import { createServer } from "http";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { SpotifyClient } from "./spotify_client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = resolve(__dirname, "../.spotify_token.json");

const REDIRECT_URI = "http://127.0.0.1:8000/callback";
const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

const SCOPES = [
  "playlist-modify-public",
  "playlist-modify-private",
  "user-library-read",
  "user-top-read",
  "user-modify-playback-state",
  "user-read-playback-state",
  "user-read-recently-played",
];

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

function saveToken(data: TokenData): void {
  writeFileSync(TOKEN_PATH, JSON.stringify(data, null, 2));
}

/**
 * Construye el SpotifyClient a partir de los tokens y le pasa un callback
 * para que cada refresh quede guardado en disco.
 */
function buildClient(
  clientId: string,
  clientSecret: string,
  tokenData: TokenData
): SpotifyClient {
  return new SpotifyClient({
    clientId,
    clientSecret,
    accessToken: tokenData.accessToken,
    refreshToken: tokenData.refreshToken,
    expiresAt: tokenData.expiresAt,
    onTokenRefresh: (accessToken, expiresAt) => {
      // El refresh token no cambia al renovar, lo conservamos.
      saveToken({ accessToken, refreshToken: tokenData.refreshToken, expiresAt });
    },
  });
}

/**
 * Autentica con Spotify usando OAuth Authorization Code flow.
 * Si hay un token cacheado válido, lo usa (y el cliente lo refresca solo si expiró).
 * Si no hay token, abre el navegador para autorizar.
 */
export async function authenticateSpotify(
  clientId: string,
  clientSecret: string
): Promise<SpotifyClient> {
  // Intentar cargar token cacheado
  if (existsSync(TOKEN_PATH)) {
    try {
      const tokenData: TokenData = JSON.parse(readFileSync(TOKEN_PATH, "utf-8"));
      const client = buildClient(clientId, clientSecret, tokenData);
      // getMe verifica que el token sirva y dispara un refresh si ya expiró.
      const user = await client.getMe();
      console.log(`✅ Conectado a Spotify como: ${user.display_name}`);
      return client;
    } catch (e) {
      console.log("⚠️  Token cacheado inválido, re-autenticando...");
    }
  }

  // Flow OAuth completo — abrir navegador
  const authUrl = buildAuthorizeUrl(clientId);
  console.log("\n🔐 Abriendo navegador para autorizar Spotify...");
  console.log(`   Si no se abre automáticamente, visitá:\n   ${authUrl}\n`);

  // Abrir navegador
  const { exec } = await import("child_process");
  exec(`open "${authUrl}"`);

  // Esperar el callback en un mini servidor HTTP
  const code = await waitForCallback();

  // Intercambiar code por tokens
  const tokenData = await exchangeCode(clientId, clientSecret, code);
  saveToken(tokenData);

  const client = buildClient(clientId, clientSecret, tokenData);
  const user = await client.getMe();
  console.log(`✅ Conectado a Spotify como: ${user.display_name}`);

  return client;
}

/**
 * Arma la URL de autorización de Spotify con los scopes que necesitamos.
 */
function buildAuthorizeUrl(clientId: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SCOPES.join(" "),
    redirect_uri: REDIRECT_URI,
    state: "state123",
    show_dialog: "true",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/**
 * Intercambia el authorization code por un par de tokens (access + refresh).
 */
async function exchangeCode(
  clientId: string,
  clientSecret: string,
  code: string
): Promise<TokenData> {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });
  if (!res.ok) {
    throw new Error(`Error al intercambiar el code: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

/**
 * Levanta un servidor HTTP temporal en puerto 8000 y espera el callback de Spotify.
 */
function waitForCallback(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url!, `http://127.0.0.1:8000`);

      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`<h1>❌ Error: ${error}</h1><p>Cerrá esta pestaña.</p>`);
          server.close();
          reject(new Error(`Spotify auth error: ${error}`));
          return;
        }

        if (code) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html><body style="background:#0d1117;color:#00ff88;font-family:monospace;text-align:center;padding:4rem;">
              <h1>✅ Spotify autorizado</h1>
              <p>Podés cerrar esta pestaña y volver a la terminal.</p>
            </body></html>
          `);
          server.close();
          resolve(code);
          return;
        }
      }

      res.writeHead(404);
      res.end("Not found");
    });

    server.listen(8000, "127.0.0.1", () => {
      console.log("   Esperando autorización en http://127.0.0.1:8000/callback ...");
    });

    // Timeout de 2 minutos
    setTimeout(() => {
      server.close();
      reject(new Error("Timeout esperando autorización de Spotify (2 min)"));
    }, 120000);
  });
}
