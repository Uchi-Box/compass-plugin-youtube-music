type PluginPlatform = 'all' | 'desktop' | 'mobile';
interface PluginManifest {
    id: string;
    name: string;
    version: string;
    description?: string;
    author?: string;
    homepage?: string;
    platforms: PluginPlatform[];
    main: string;
    icon?: string;
    brandColor?: string;
    capabilities: {
        dataSource?: boolean;
    };
    settings?: string;
}
interface TrackSource {
    plugin: string;
    externalId: string;
}
interface TrackReference {
    id: string;
    source: TrackSource;
    title?: string;
    artist?: string;
}
type AudioFormat = 'mp3' | 'm4a' | 'flac' | 'ogg' | 'webm' | 'wav';
interface StreamInfo {
    url: string;
    format: AudioFormat;
    bitrate?: number;
    fileSize?: number;
    headers?: Record<string, string>;
}
interface SearchOptions {
    limit?: number;
    offset?: number;
}
interface DataSourceSearchResult {
    id: string;
    title: string;
    artist: string;
    album?: string;
    coverUrl?: string;
    duration?: number;
    source: string;
}
interface TrackMetadata {
    title?: string;
    artist?: string;
    album?: string;
    coverUrl?: string;
    duration?: number;
}
interface Lyrics {
    lines?: Array<{
        time: number;
        text: string;
    }>;
    text?: string;
}
interface ProtocolRequest {
    url: string;
    headers: Record<string, string>;
}
interface ProtocolResponse {
    data: ArrayBuffer | ReadableStream | Response;
    headers?: Record<string, string>;
    statusCode?: number;
}
type ProtocolHandler = (request: ProtocolRequest) => Promise<ProtocolResponse> | ProtocolResponse;
interface PluginContext {
    manifest: PluginManifest;
    getSetting<T>(key: string): T | undefined;
    setSetting<T>(key: string, value: T): void;
    log(level: 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void;
    fetch?(url: string, options?: RequestInit): Promise<Response>;
    registerProtocol?(scheme: string, handler: ProtocolHandler): void;
}
interface DataSourcePlugin {
    readonly id: string;
    readonly name: string;
    activate?(context: PluginContext): Promise<void> | void;
    deactivate?(): Promise<void> | void;
    search(query: string, options?: SearchOptions): Promise<DataSourceSearchResult[]>;
    resolveStream(track: TrackReference): Promise<StreamInfo>;
    getMetadata?(track: TrackReference): Promise<TrackMetadata | null>;
    getLyrics?(track: TrackReference): Promise<Lyrics | null>;
}
interface PluginInstance {
    activate?(context: PluginContext): Promise<void> | void;
    deactivate?(): Promise<void> | void;
}

declare const manifest: PluginManifest;
declare class YouTubeMusicDataSourcePlugin implements DataSourcePlugin, PluginInstance {
    readonly id: string;
    readonly name: string;
    private context?;
    private settings;
    private client;
    activate(context: PluginContext): Promise<void>;
    deactivate(): Promise<void>;
    search(query: string, options?: SearchOptions): Promise<DataSourceSearchResult[]>;
    resolveStream(track: TrackReference): Promise<StreamInfo>;
    getMetadata(track: TrackReference): Promise<TrackMetadata>;
    getLyrics(_track: TrackReference): Promise<Lyrics | null>;
    private refreshSettings;
    private createClient;
    private resolvePlayableStream;
    private resolveStreamWithYtDlp;
    private resolveStreamFromFallbackSearch;
}
declare const plugin: YouTubeMusicDataSourcePlugin;

export { YouTubeMusicDataSourcePlugin, plugin as default, plugin as instance, manifest };
