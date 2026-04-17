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
interface PluginCredentialStore {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
}
interface AuthWindowCookie {
    name: string;
    value: string;
    domain: string;
    path: string;
}
interface AuthWindowOptions {
    title?: string;
    width?: number;
    height?: number;
    redirectPattern?: string;
    injectScript?: string;
}
interface AuthResult {
    url: string;
    cookies: AuthWindowCookie[];
    scriptResult?: unknown;
}
interface PluginConfigContext {
    get<T>(keyPath: string): T | undefined;
    set(keyPath: string, value: unknown): void;
    observe(keyPath: string, callback: (value: unknown) => void): {
        dispose(): void;
    };
}
interface PluginContext {
    manifest: PluginManifest;
    platform: 'desktop' | 'mobile';
    config: PluginConfigContext;
    log(level: 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void;
    fetch?(url: string, options?: RequestInit): Promise<Response>;
    storage?: {
        get(id: string): Promise<any>;
        put(doc: any): Promise<any>;
        remove(id: string): Promise<any>;
        list(options?: any): Promise<any>;
    };
    credentials?: PluginCredentialStore;
    openAuthWindow?(url: string, options?: AuthWindowOptions): Promise<AuthResult>;
    registerProtocol?(scheme: string, handler: ProtocolHandler): void;
}

declare class YouTubeMusicDataSourcePlugin {
    readonly id = "compass-plugin-youtube-music";
    readonly name = "YouTube Music";
    private context?;
    private settings;
    private client;
    activate(context: PluginContext): Promise<void>;
    deactivate(): Promise<void>;
    search(query: string, options?: any): Promise<any[]>;
    resolveStream(track: any): Promise<any>;
    getMetadata(track: any): Promise<any>;
    getLyrics(_track: any): Promise<any>;
    private refreshSettings;
    private createClient;
    private resolvePlayableStream;
    private resolveStreamWithYtDlp;
    private resolveStreamFromFallbackSearch;
}
declare const plugin: YouTubeMusicDataSourcePlugin;

export { YouTubeMusicDataSourcePlugin, plugin as default };
