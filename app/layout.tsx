import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ConvoBank — Fiverr Conversation Platform',
  description: 'Store, analyze, and generate Fiverr client conversations',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
