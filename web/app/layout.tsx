import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: 'switchboard',
  description: 'Rules-based Nostr follow list manager',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Configure window.nostr.js before it loads */}
        <script dangerouslySetInnerHTML={{ __html: `
          window.wnjParams = {
            appMetadata: {
              name: 'switchboard',
              url: typeof window !== 'undefined' ? window.location.origin : '',
            },
            accent: 'purple',
          }
        `}} />
      </head>
      <body className="bg-zinc-950 text-white min-h-screen antialiased">
        {/* window.nostr.js by fiatjaf — handles NIP-07 extensions + NIP-46 bunkers */}
        {/* Polyfills window.nostr for users without a browser extension installed */}
        <Script
          src="https://cdn.jsdelivr.net/npm/window.nostr.js/dist/window.nostr.min.js"
          strategy="beforeInteractive"
        />
        {children}
      </body>
    </html>
  )
}
