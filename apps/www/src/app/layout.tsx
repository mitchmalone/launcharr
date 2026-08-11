import type { Metadata } from 'next'
import { ThemeProvider } from 'next-themes'
import { IBM_Plex_Sans, JetBrains_Mono } from 'next/font/google'

import './globals.css'

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-jetbrains-mono',
})

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-sans',
})

export const metadata: Metadata = {
  title: 'launcharr — an app launcher for pirates',
  description:
    'A macOS app launcher that behaves like a shell prompt. Hit ⌥Space, type into a REPL, launch an app or fling a command at your terminal. Free and open source.',
  metadataBase: new URL('https://launcharr.com'),
  openGraph: {
    title: 'launcharr — an app launcher for pirates',
    description:
      'A macOS app launcher that behaves like a shell prompt. Free and open source.',
    images: ['/og.png'],
  },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${jetbrainsMono.variable} ${ibmPlexSans.variable} font-mono`}
      >
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="system"
          enableSystem
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
