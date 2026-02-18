// Type declarations for window.nostr (NIP-07 browser extension API)
// https://github.com/nostr-protocol/nips/blob/master/07.md

interface NostrEvent {
  id?: string
  pubkey?: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig?: string
}

interface Window {
  nostr?: {
    getPublicKey(): Promise<string>
    signEvent(event: NostrEvent): Promise<NostrEvent & { id: string; sig: string }>
    getRelays?(): Promise<Record<string, { read: boolean; write: boolean }>>
    nip04?: {
      encrypt(pubkey: string, plaintext: string): Promise<string>
      decrypt(pubkey: string, ciphertext: string): Promise<string>
    }
    nip44?: {
      encrypt(pubkey: string, plaintext: string): Promise<string>
      decrypt(pubkey: string, ciphertext: string): Promise<string>
    }
  }
  // window.nostr.js config params (set before the script loads)
  wnjParams?: {
    appMetadata?: { name?: string; url?: string; image?: string }
    accent?: string
    position?: string
    startHidden?: boolean
  }
}
