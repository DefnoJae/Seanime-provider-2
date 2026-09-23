// AniZone online-stream provider for Seanime.
// The runtime supplies these types and globals; declarations are removed when
// Seanime transpiles this TypeScript payload.

declare type SubOrDub = "sub" | "dub" | "both";
declare type VideoSourceType = "mp4" | "m3u8" | "unknown";

declare interface Settings {
  episodeServers: string[];
  supportsDub: boolean;
}

declare interface Media {
  id: number;
  idMal?: number;
  status?: string;
  format?: string;
  englishTitle?: string;
  romajiTitle?: string;
  episodeCount?: number;
  synonyms: string[];
  isAdult: boolean;
}

declare interface SearchOptions {
  media: Media;
  query: string;
  dub: boolean;
  year?: number;
}

declare interface SearchResult {
  id: string;
  title: string;
  url: string;
  subOrDub: SubOrDub;
}

declare interface EpisodeDetails {
  id: string;
  number: number;
  url: string;
  title?: string;
}

declare interface VideoSubtitle {
  id: string;
  url: string;
  language: string;
  isDefault: boolean;
}

declare interface VideoSource {
  url: string;
  type: VideoSourceType;
  quality: string;
  label?: string;
  subtitles: VideoSubtitle[];
}

declare interface EpisodeServer {
  server: string;
  headers: Record<string, string>;
  videoSources: VideoSource[];
}

declare interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  noCloudflareBypass?: boolean;
  redirect?: "follow" | "manual" | "error";
  timeout?: number;
}

declare interface FetchResponse {
  status: number;
  statusText: string;
  ok: boolean;
  url: string;
  headers: Record<string, string>;
  text(): string;
  json<T = any>(): T;
}

declare function fetch(url: string, options?: FetchOptions): Promise<FetchResponse>;

interface AniZoneAnime {
  slug: string;
  url?: string;
  main_title?: string;
  title_list?: Record<string, string>;
  start_year?: number;
}

interface AniZoneEpisode {
  slug: string;
  url?: string;
  title_list?: Record<string, string>;
  videos_count?: number;
}

interface AniZoneSubtitle {
  title?: string;
  language?: string;
  default?: boolean;
  forced?: string | boolean;
  file?: string;
}

interface AniZonePlayer {
  src?: string;
  subtitles?: AniZoneSubtitle[];
}

const BASE_URL = "https://anizone.to";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const PAGE_LIMIT = 100;

class Provider {
  getSettings(): Settings {
    return {
      episodeServers: ["AniZone"],
      // AniZone does not split its catalog into separate sub/dub entries. Let
      // Seanime search it in either playback mode and use the audio tracks
      // exposed by the resolved HLS stream.
      supportsDub: true,
    };
  }

  private async getPage(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": USER_AGENT,
      },
      timeout: 30,
    });

    if (!response.ok) {
      throw new Error(`AniZone returned HTTP ${response.status} for ${url}`);
    }

    return response.text();
  }

  /** Decode the JavaScript string passed to JSON.parse in AniZone's x-data. */
  private decodeEmbeddedJson<T>(payload: string): T {
    const decoded = JSON.parse(`"${payload.replace(/"/g, '\\"')}"`);
    return JSON.parse(decoded) as T;
  }

  private extractItems<T>(html: string): T[] {
    const match = html.match(/items:\s*JSON\.parse\('([\s\S]*?)'\)/);
    if (!match) return [];

    try {
      return this.decodeEmbeddedJson<T[]>(match[1]);
    } catch (error) {
      console.error("AniZone: failed to decode page items", error);
      return [];
    }
  }

  private extractNextCursor(html: string): string | null {
    const match = html.match(/nextCursor:\s*(?:'([^']+)'|null)/);
    return match?.[1] || null;
  }

  private englishTitle(titles?: Record<string, string>): string | undefined {
    if (!titles) return undefined;
    // AniDB language ID 1 is English on AniZone. Fall back to the first value.
    return titles["1"] || Object.keys(titles).map((key) => titles[key]).find(Boolean);
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const query = (options.query || "").trim();
    if (!query) return [];

    const html = await this.getPage(`${BASE_URL}/anime?search=${encodeURIComponent(query)}`);
    const items = this.extractItems<AniZoneAnime>(html);

    return items
      .filter((item) => Boolean(item?.slug))
      .map((item) => ({
        id: item.slug,
        title: item.main_title || this.englishTitle(item.title_list) || item.slug,
        url: `${BASE_URL}/anime/${item.slug}`,
        // AniZone provides one catalog entry for both playback preferences.
        // Marking it as "both" keeps automatic matching and episode navigation
        // working when Seanime's global preference is set to dubbed.
        subOrDub: "both" as SubOrDub,
      }));
  }

  async findEpisodes(id: string): Promise<EpisodeDetails[]> {
    const slug = this.normalizeAnimeId(id);
    const episodes: EpisodeDetails[] = [];
    const seenIds: Record<string, boolean> = {};
    const seenCursors: Record<string, boolean> = {};
    let cursor: string | null = null;

    for (let page = 0; page < PAGE_LIMIT; page++) {
      const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const html = await this.getPage(`${BASE_URL}/anime/${slug}${suffix}`);
      const items = this.extractItems<AniZoneEpisode>(html);

      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        if (!item?.slug || seenIds[item.slug] || item.videos_count === 0) continue;

        const numberMatch = item.slug.match(/\d+/);
        const number = numberMatch ? parseInt(numberMatch[0], 10) : episodes.length + 1;
        const title = this.englishTitle(item.title_list);
        const url = `${BASE_URL}/anime/${slug}/${encodeURIComponent(item.slug)}`;

        episodes.push({
          id: JSON.stringify({ anime: slug, episode: item.slug }),
          number,
          url,
          ...(title ? { title } : {}),
        });
        seenIds[item.slug] = true;
      }

      const next = this.extractNextCursor(html);
      if (!next || seenCursors[next]) break;
      seenCursors[next] = true;
      cursor = next;
    }

    episodes.sort((a, b) => a.number - b.number);
    return episodes;
  }

  async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
    const pageUrl = episode.url || this.episodeUrlFromId(episode.id);
    const html = await this.getPage(pageUrl);
    const match = html.match(/vidstackPlayer\(JSON\.parse\('([\s\S]*?)'\)\)/);

    if (!match) throw new Error("AniZone player data was not found");

    let player: AniZonePlayer;
    try {
      player = this.decodeEmbeddedJson<AniZonePlayer>(match[1]);
    } catch (error) {
      console.error("AniZone: failed to decode player data", error);
      throw new Error("AniZone player data could not be decoded");
    }

    if (!player.src) throw new Error("AniZone did not provide a video source");

    const subtitles: VideoSubtitle[] = (player.subtitles || [])
      .filter((subtitle) => Boolean(subtitle?.file))
      .map((subtitle, index) => {
        const code = subtitle.language || "und";
        const label = subtitle.title || code;
        return {
          id: `${code}-${index + 1}`,
          url: subtitle.file as string,
          // Keep AniZone's descriptive label so tracks such as full dialogue
          // and "Signs & Songs" remain distinguishable in Seanime's picker.
          language: label,
          isDefault: subtitle.default === true,
        };
      });

    return {
      server: "AniZone",
      headers: {
        Referer: pageUrl,
        Origin: BASE_URL,
        "User-Agent": USER_AGENT,
      },
      videoSources: [
        {
          url: player.src,
          type: player.src.includes(".m3u8") ? "m3u8" : "unknown",
          quality: "auto",
          label: "AniZone",
          subtitles,
        },
      ],
    };
  }

  private normalizeAnimeId(id: string): string {
    try {
      const parsed = JSON.parse(id);
      if (parsed && typeof parsed.anime === "string") return parsed.anime;
    } catch (_error) {
      // Search IDs are plain slugs; JSON IDs are accepted for compatibility.
    }
    return id.replace(/^https?:\/\/[^/]+\/anime\//, "").split(/[/?#]/)[0];
  }

  private episodeUrlFromId(id: string): string {
    try {
      const parsed = JSON.parse(id);
      if (parsed?.anime && parsed?.episode) {
        return `${BASE_URL}/anime/${parsed.anime}/${encodeURIComponent(parsed.episode)}`;
      }
    } catch (_error) {
      // Fall through to a clear error below.
    }
    throw new Error("AniZone episode ID is invalid");
  }
}

