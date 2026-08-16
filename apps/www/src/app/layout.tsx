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

const TITLE = 'launcharr — the keyboard control surface for macOS'
const DESCRIPTION =
  'A macOS launcher that dresses up as a shell prompt, plus a menubar replacement, keyboard-driven TUI panels and agent monitoring. Hit ⌥Space and run your Mac without touching the mouse. Free and open source.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  metadataBase: new URL('https://launcharr.com'),
  openGraph: {
    title: TITLE,
    description:
      'A macOS launcher that dresses up as a shell prompt — plus the bar, TUI panels and agent monitoring. Free and open source.',
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
