// Bunker (NIP-46) direct connection — no popup needed
//
// Used in PWA standalone mode where window.open() breaks out to Safari.
// Connects directly to a bunker:// URL using nostr-tools' BunkerSigner,
// then polyfills window.nostr so the rest of the app works unchanged.

import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46'
import { generateSecretKey } from 'nostr-tools/pure'

const BUNKER_URL_KEY = 'nostr_bunker_url'
const CLIENT_SK_KEY = 'nostr_bunker_client_sk'

// Keep a module-level reference so we can close it on disconnect
let activeSigner: BunkerSigner | null = null

// ── localStorage helpers ────────────────────────────────────────────────────

/** Returns stored bunker URL or null */
export function getStoredBunkerURL(): string | null {
  return localStorage.getItem(BUNKER_URL_KEY)
}

/** Removes all stored bunker connection data */
export function clearBunkerConnection(): void {
  localStorage.removeItem(BUNKER_URL_KEY)
  localStorage.removeItem(CLIENT_SK_KEY)
  if (activeSigner) {
    activeSigner.close().catch(() => {})
    activeSigner = null
  }
}

/** Get or generate a persistent client secret key (Uint8Array stored as JSON array) */
function getClientSecretKey(): Uint8Array {
  const stored = localStorage.getItem(CLIENT_SK_KEY)
  if (stored) {
    try {
      return new Uint8Array(JSON.parse(stored))
    } catch { /* regenerate */ }
  }
  const sk = generateSecretKey()
  localStorage.setItem(CLIENT_SK_KEY, JSON.stringify(Array.from(sk)))
  return sk
}

// ── window.nostr polyfill ───────────────────────────────────────────────────

/** Overwrites window.nostr with BunkerSigner-backed methods */
function installWindowNostr(signer: BunkerSigner): void {
  window.nostr = {
    async getPublicKey() {
      return signer.getPublicKey()
    },
    async signEvent(event) {
      const signed = await signer.signEvent(event)
      return signed as unknown as NostrEvent & { id: string; sig: string }
    },
    nip04: {
      async encrypt(pubkey: string, plaintext: string) {
        return signer.nip04Encrypt(pubkey, plaintext)
      },
      async decrypt(pubkey: string, ciphertext: string) {
        return signer.nip04Decrypt(pubkey, ciphertext)
      },
    },
    nip44: {
      async encrypt(pubkey: string, plaintext: string) {
        return signer.nip44Encrypt(pubkey, plaintext)
      },
      async decrypt(pubkey: string, ciphertext: string) {
        return signer.nip44Decrypt(pubkey, ciphertext)
      },
    },
  }
}

// ── public API ──────────────────────────────────────────────────────────────

/**
 * Connect to a bunker:// URL directly.
 * Parses the URL, creates a BunkerSigner, connects, polyfills window.nostr,
 * stores connection info, and returns the user's pubkey.
 */
export async function connectBunker(bunkerURL: string): Promise<string> {
  const bp = await parseBunkerInput(bunkerURL)
  if (!bp) throw new Error('Invalid bunker URL')

  // Close any previous connection
  if (activeSigner) {
    activeSigner.close().catch(() => {})
    activeSigner = null
  }

  const clientSK = getClientSecretKey()
  const signer = BunkerSigner.fromBunker(clientSK, bp)

  await signer.connect()
  activeSigner = signer

  installWindowNostr(signer)
  localStorage.setItem(BUNKER_URL_KEY, bunkerURL)

  return signer.getPublicKey()
}

/**
 * Reconnect using stored bunker URL. Returns pubkey on success, null on failure.
 * Clears stored data if reconnection fails.
 */
export async function reconnectBunker(): Promise<string | null> {
  const url = getStoredBunkerURL()
  if (!url) return null

  try {
    return await connectBunker(url)
  } catch (err) {
    console.error('Bunker reconnect failed:', err)
    clearBunkerConnection()
    return null
  }
}
