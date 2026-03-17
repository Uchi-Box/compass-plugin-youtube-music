import { execFile } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { chmod, mkdir, rename, stat, unlink } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'

const execFileAsync = promisify(execFile)

const YT_DLP_VERSION = '2025.03.15'
const CACHE_DIR = join(homedir(), '.compass', 'bin')
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function getBinaryName(): string {
  switch (platform()) {
    case 'win32':
      return 'yt-dlp.exe'
    case 'darwin':
      return 'yt-dlp_macos'
    default:
      return 'yt-dlp_linux'
  }
}

function getDownloadUrl(): string {
  const name = getBinaryName()
  return `https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/${name}`
}

function getCachedPath(): string {
  const localName = platform() === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
  return join(CACHE_DIR, localName)
}

async function isCacheFresh(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath)
    return Date.now() - info.mtimeMs < MAX_AGE_MS
  } catch {
    return false
  }
}

async function downloadBinary(
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>
): Promise<string> {
  const cachedPath = getCachedPath()
  await mkdir(CACHE_DIR, { recursive: true })

  const url = getDownloadUrl()
  const tmpPath = cachedPath + '.tmp'

  const response = await fetchImpl(url, { redirect: 'follow' })
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download yt-dlp: HTTP ${response.status}`)
  }

  try {
    const fileStream = createWriteStream(tmpPath)
    await pipeline(response.body as unknown as Readable, fileStream)
    await rename(tmpPath, cachedPath)

    if (platform() !== 'win32') {
      await chmod(cachedPath, 0o755)
    }
  } catch (error) {
    try {
      await unlink(tmpPath)
    } catch {}
    throw error
  }

  return cachedPath
}

async function verifyBinary(binPath: string): Promise<boolean> {
  try {
    await execFileAsync(binPath, ['--version'], { timeout: 5000 })
    return true
  } catch {
    return false
  }
}

/**
 * Resolve the path to a working yt-dlp binary.
 * Downloads and caches it automatically if not present.
 */
export async function resolveYtDlpPath(
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = globalThis.fetch
): Promise<string> {
  const cachedPath = getCachedPath()

  if (existsSync(cachedPath) && (await isCacheFresh(cachedPath))) {
    return cachedPath
  }

  // Try system-installed yt-dlp first
  const systemCandidates =
    platform() === 'win32'
      ? ['yt-dlp.exe', 'yt-dlp']
      : ['/opt/homebrew/bin/yt-dlp', '/usr/local/bin/yt-dlp', 'yt-dlp']

  for (const candidate of systemCandidates) {
    if (await verifyBinary(candidate)) {
      return candidate
    }
  }

  // Auto-download
  const downloaded = await downloadBinary(fetchImpl)
  if (await verifyBinary(downloaded)) {
    return downloaded
  }

  throw new Error(
    'Failed to resolve yt-dlp binary. Download may have failed or binary is not executable.'
  )
}
