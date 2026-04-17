export type PluginPlatform = 'all' | 'desktop' | 'mobile'

export interface PluginManifest {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  homepage?: string
  platforms: PluginPlatform[]
  main: string
  icon?: string
  brandColor?: string
  capabilities: {
    dataSource?: boolean
  }
  settings?: string
}

export interface TrackSource {
  plugin: string
  externalId: string
}

export interface TrackReference {
  id: string
  source: TrackSource
  title?: string
  artist?: string
}

export type AudioFormat = 'mp3' | 'm4a' | 'flac' | 'ogg' | 'webm' | 'wav'

export interface StreamInfo {
  url: string
  format: AudioFormat
  bitrate?: number
  fileSize?: number
  headers?: Record<string, string>
}

export interface SearchOptions {
  limit?: number
  offset?: number
}

export interface DataSourceSearchResult {
  id: string
  title: string
  artist: string
  album?: string
  coverUrl?: string
  duration?: number
  source: string
}

export interface TrackMetadata {
  title?: string
  artist?: string
  album?: string
  coverUrl?: string
  duration?: number
}

export interface Lyrics {
  lines?: Array<{ time: number; text: string }>
  text?: string
}

export interface ProtocolRequest {
  url: string
  headers: Record<string, string>
}

export interface ProtocolResponse {
  data: ArrayBuffer | ReadableStream | Response
  headers?: Record<string, string>
  statusCode?: number
}

export type ProtocolHandler = (
  request: ProtocolRequest
) => Promise<ProtocolResponse> | ProtocolResponse

// --- Plugin Auth & Credential types ---

export interface PluginCredentialStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

export interface AuthWindowCookie {
  name: string
  value: string
  domain: string
  path: string
}

export interface AuthWindowOptions {
  title?: string
  width?: number
  height?: number
  redirectPattern?: string
  injectScript?: string
}

export interface AuthResult {
  url: string
  cookies: AuthWindowCookie[]
  scriptResult?: unknown
}

export type AuthStatus = 'authenticated' | 'unauthenticated' | 'expired' | 'checking'

export interface DataSourceAuthInfo {
  required: boolean
  loginLabel?: string
  getStatus(): Promise<AuthStatus>
  login(): Promise<boolean>
  logout(): Promise<void>
}

export interface PluginConfigContext {
  get<T>(keyPath: string): T | undefined
  set(keyPath: string, value: unknown): void
  observe(keyPath: string, callback: (value: unknown) => void): { dispose(): void }
}

export interface PluginContext {
  manifest: PluginManifest
  platform: 'desktop' | 'mobile'
  config: PluginConfigContext
  log(
    level: 'info' | 'warn' | 'error',
    message: string,
    ...args: unknown[]
  ): void
  fetch?(url: string, options?: RequestInit): Promise<Response>
  storage?: { get(id: string): Promise<any>; put(doc: any): Promise<any>; remove(id: string): Promise<any>; list(options?: any): Promise<any> }
  credentials?: PluginCredentialStore
  openAuthWindow?(url: string, options?: AuthWindowOptions): Promise<AuthResult>
  registerProtocol?(scheme: string, handler: ProtocolHandler): void
}

export interface DataSourcePlugin {
  readonly id: string
  readonly name: string
  auth?: DataSourceAuthInfo
  activate?(context: PluginContext): Promise<void> | void
  deactivate?(): Promise<void> | void
  search(
    query: string,
    options?: SearchOptions
  ): Promise<DataSourceSearchResult[]>
  resolveStream(track: TrackReference): Promise<StreamInfo>
  getMetadata?(track: TrackReference): Promise<TrackMetadata | null>
  getLyrics?(track: TrackReference): Promise<Lyrics | null>
}

export interface PluginInstance {
  activate?(context: PluginContext): Promise<void> | void
  deactivate?(): Promise<void> | void
}
