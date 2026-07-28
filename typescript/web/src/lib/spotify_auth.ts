/**
 * OAuth de Spotify para el web (Authorization Code flow).
 *
 * A diferencia del CLI, acá no levantamos un server: el propio web recibe el
 * callback en /api/spotify/callback. Este módulo arma la URL de autorización,
 * intercambia el code por tokens y los guarda en el mismo archivo que lee el
 * resto del web (TOKEN_PATH).
 */

import { config as loadEnv } from "dotenv";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { TOKEN_PATH } from "./spotify.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "../../.env") });

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

/**
 * Redirect URI del web. DEBE estar registrado en el dashboard de Spotify.
 * Spotify exige loopback con 127.0.0.1 (no "localhost") para HTTP.
 * Se puede sobreescribir con SPOTIFY_REDIRECT_URI en el .env.
 */
export const REDIRECT_URI =
  process.env.SPOTIFY_REDIRECT_URI ?? "http://127.0.0.1:4321/api/spotify/callback";

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/** URL a la que mandamos al usuario para que autorice. */
export function buildAuthorizeUrl(clientId: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SCOPES.join(" "),
    redirect_uri: REDIRECT_URI,
    state,
    show_dialog: "false",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/** Intercambia el authorization code por el par de tokens (access + refresh). */
export async function exchangeCode(
  clientId: string,
  clientSecret: string,
  code: string,
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

/** Guarda el token en el archivo canónico que lee el resto del web. */
export function saveToken(data: TokenData): void {
  writeFileSync(TOKEN_PATH, JSON.stringify(data, null, 2));
}
