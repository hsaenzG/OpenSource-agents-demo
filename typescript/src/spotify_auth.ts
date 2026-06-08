/**
 * Spotify OAuth Flow — Autenticación con usuario completo.
 *
 * Levanta un mini servidor HTTP en puerto 8000 para capturar el callback de Spotify.
 * La primera vez abre el navegador para autorizar. Después cachea el token en .spotify_token.json.
 */

import { createServer } from "http";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import SpotifyWebApi from "spotify-web-api-node";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = resolve(__dirname, "../.spotify_token.json");

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

/**
 * Autentica con Spotify usando OAuth Authorization Code flow.
 * Si hay un token cacheado válido, lo usa. Si expiró, lo refresca.
 * Si no hay token, abre el navegador para autorizar.
 */
export async function authenticateSpotify(
  clientId: string,
  clientSecret: string
): Promise<SpotifyWebApi> {
  const spotifyApi = new SpotifyWebApi({
    clientId,
    clientSecret,
    redirectUri: "http://127.0.0.1:8000/callback",
  });

  // Intentar cargar token cacheado
  if (existsSync(TOKEN_PATH)) {
    try {
      const tokenData: TokenData = JSON.parse(readFileSync(TOKEN_PATH, "utf-8"));

      spotifyApi.setAccessToken(tokenData.accessToken);
      spotifyApi.setRefreshToken(tokenData.refreshToken);

      // Si el token expiró, refrescar
      if (Date.now() > tokenData.expiresAt - 60000) {
        console.log("🔄 Refrescando token de Spotify...");
        const refreshed = await spotifyApi.refreshAccessToken();
        spotifyApi.setAccessToken(refreshed.body.access_token);

        const newTokenData: TokenData = {
          accessToken: refreshed.body.access_token,
          refreshToken: tokenData.refreshToken,
          expiresAt: Date.now() + refreshed.body.expires_in * 1000,
        };
        writeFileSync(TOKEN_PATH, JSON.stringify(newTokenData, null, 2));
      }

      // Verificar que funcione
      const user = await spotifyApi.getMe();
      console.log(`✅ Conectado a Spotify como: ${user.body.display_name}`);
      return spotifyApi;
    } catch (e) {
      console.log("⚠️  Token cacheado inválido, re-autenticando...");
    }
  }

  // Flow OAuth completo — abrir navegador
  const authUrl = spotifyApi.createAuthorizeURL(SCOPES, "state123", true);
  console.log("\n🔐 Abriendo navegador para autorizar Spotify...");
  console.log(`   Si no se abre automáticamente, visitá:\n   ${authUrl}\n`);

  // Abrir navegador
  const { exec } = await import("child_process");
  exec(`open "${authUrl}"`);

  // Esperar el callback en un mini servidor HTTP
  const code = await waitForCallback();

  // Intercambiar code por tokens
  const tokenResponse = await spotifyApi.authorizationCodeGrant(code);
  spotifyApi.setAccessToken(tokenResponse.body.access_token);
  spotifyApi.setRefreshToken(tokenResponse.body.refresh_token);

  // Cachear tokens
  const tokenData: TokenData = {
    accessToken: tokenResponse.body.access_token,
    refreshToken: tokenResponse.body.refresh_token,
    expiresAt: Date.now() + tokenResponse.body.expires_in * 1000,
  };
  writeFileSync(TOKEN_PATH, JSON.stringify(tokenData, null, 2));

  const user = await spotifyApi.getMe();
  console.log(`✅ Conectado a Spotify como: ${user.body.display_name}`);

  return spotifyApi;
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
