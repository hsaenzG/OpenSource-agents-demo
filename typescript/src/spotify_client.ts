/**
 * Cliente nativo de Spotify — llamadas directas a la Web API con fetch.
 *
 * Reemplaza a spotify-web-api-node. Node 18+ ya trae fetch, Buffer y
 * URLSearchParams nativos, así que no necesitamos ninguna librería externa
 * para hablar con Spotify. Solo HTTP directo contra su API.
 *
 * Docs: https://developer.spotify.com/documentation/web-api
 */

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";

export interface SpotifyTrack {
  name: string;
  uri: string;
  duration_ms: number;
  artists: { name: string }[];
  album: { name: string };
}

export interface SpotifyDevice {
  id: string | null;
  is_active: boolean;
  name: string;
}

export interface SpotifyUser {
  id: string;
  display_name: string;
}

export interface SpotifyArtist {
  name: string;
  genres: string[];
}

export interface SpotifyPlaylist {
  id: string;
  external_urls: { spotify: string };
}

export type TimeRange = "short_term" | "medium_term" | "long_term";

interface SpotifyClientOptions {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  /** Se llama cada vez que refrescamos el token, para persistirlo en disco. */
  onTokenRefresh?: (accessToken: string, expiresAt: number) => void;
}

/**
 * Agrega el filtro `year:` de Spotify a un query según el rango de años.
 * Acepta que venga solo el inicio, solo el fin, o ambos. Si no viene ninguno,
 * devuelve el query tal cual. Ordena los años por si llegan al revés.
 *
 *   conFiltroDeAnios("deep house", 2018, 2024) → "deep house year:2018-2024"
 *   conFiltroDeAnios("techno", 2020)           → "techno year:2020"
 */
export function conFiltroDeAnios(
  query: string,
  anioInicio?: number,
  anioFin?: number,
): string {
  if (!anioInicio && !anioFin) return query;
  const inicio = anioInicio ?? anioFin!;
  const fin = anioFin ?? anioInicio!;
  const [desde, hasta] = inicio <= fin ? [inicio, fin] : [fin, inicio];
  const filtro = desde === hasta ? `year:${desde}` : `year:${desde}-${hasta}`;
  return `${query} ${filtro}`.trim();
}

export class SpotifyClient {
  private accessToken: string;
  private expiresAt: number;
  private readonly refreshToken: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly onTokenRefresh?: (accessToken: string, expiresAt: number) => void;

  constructor(opts: SpotifyClientOptions) {
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.accessToken = opts.accessToken;
    this.refreshToken = opts.refreshToken;
    this.expiresAt = opts.expiresAt;
    this.onTokenRefresh = opts.onTokenRefresh;
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────

  /** Refresca el access token con el refresh token. */
  private async refresh(): Promise<void> {
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.refreshToken,
      }),
    });
    if (!res.ok) {
      throw new Error(`No se pudo refrescar el token: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + data.expires_in * 1000;
    this.onTokenRefresh?.(this.accessToken, this.expiresAt);
  }

  /**
   * Hace una llamada autenticada a la Web API de Spotify.
   * Refresca el token si está por expirar y reintenta una vez ante un 401.
   */
  private async request<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      query?: Record<string, string | number>;
    } = {}
  ): Promise<T> {
    // Refresco proactivo: si el token vence en menos de 1 min, lo renovamos.
    if (Date.now() > this.expiresAt - 60000) {
      await this.refresh();
    }

    const url = new URL(`${API_BASE}${path}`);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        url.searchParams.set(key, String(value));
      }
    }

    const doFetch = () =>
      fetch(url, {
        method: options.method ?? "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });

    let res = await doFetch();

    // El token pudo expirar a mitad de camino → refrescar y reintentar una vez.
    if (res.status === 401) {
      await this.refresh();
      res = await doFetch();
    }

    if (!res.ok) {
      throw new Error(`Spotify API ${res.status}: ${await res.text()}`);
    }

    // Varios endpoints (play, addTracks) devuelven 204 sin cuerpo.
    if (res.status === 204) {
      return undefined as T;
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  // ─── Endpoints ───────────────────────────────────────────────────────────────

  async getMe(): Promise<SpotifyUser> {
    return this.request<SpotifyUser>("/me");
  }

  /**
   * Busca tracks. `limit` puede ser hasta 50 (máximo de Spotify) y `offset`
   * permite paginar para traer resultados distintos en llamadas sucesivas.
   * `market` acota al catálogo de un país (p. ej. "MX"), lo que cambia y
   * amplía la variedad de lo que devuelve.
   *
   * El `query` acepta la sintaxis de filtros de Spotify:
   *   "deep house genre:house year:2018-2024"
   */
  async searchTracks(
    query: string,
    limit = 10,
    offset = 0,
    market?: string,
  ): Promise<SpotifyTrack[]> {
    const params: Record<string, string | number> = {
      q: query,
      type: "track",
      limit: Math.min(Math.max(limit, 1), 50),
      offset: Math.min(Math.max(offset, 0), 1000),
    };
    if (market) params.market = market;
    const data = await this.request<{ tracks: { items: SpotifyTrack[] } }>("/search", {
      query: params,
    });
    return data.tracks?.items ?? [];
  }

  async getDevices(): Promise<SpotifyDevice[]> {
    const data = await this.request<{ devices: SpotifyDevice[] }>("/me/player/devices");
    return data.devices ?? [];
  }

  async play(deviceId: string, uris: string[]): Promise<void> {
    await this.request<void>("/me/player/play", {
      method: "PUT",
      query: { device_id: deviceId },
      body: { uris },
    });
  }

  async createPlaylist(
    userId: string,
    name: string,
    description: string,
    isPublic = false
  ): Promise<SpotifyPlaylist> {
    return this.request<SpotifyPlaylist>(`/users/${userId}/playlists`, {
      method: "POST",
      body: { name, description, public: isPublic },
    });
  }

  async addTracksToPlaylist(playlistId: string, uris: string[]): Promise<void> {
    await this.request<void>(`/playlists/${playlistId}/tracks`, {
      method: "POST",
      body: { uris },
    });
  }

  async getTopArtists(limit = 10, timeRange: TimeRange = "medium_term"): Promise<SpotifyArtist[]> {
    const data = await this.request<{ items: SpotifyArtist[] }>("/me/top/artists", {
      query: { limit, time_range: timeRange },
    });
    return data.items ?? [];
  }

  async getTopTracks(limit = 10, timeRange: TimeRange = "medium_term"): Promise<SpotifyTrack[]> {
    const data = await this.request<{ items: SpotifyTrack[] }>("/me/top/tracks", {
      query: { limit, time_range: timeRange },
    });
    return data.items ?? [];
  }
}
