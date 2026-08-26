import type { Metadata, Viewport } from 'next';
import { Special_Elite, Archivo } from 'next/font/google';
import './globals.css';

const specialElite = Special_Elite({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-special-elite',
  display: 'swap',
});

const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
});

const SITE = 'https://redstring.lol';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: 'redstring.lol — the board decides',
    template: '%s | redstring.lol',
  },
  description:
    'A pay-to-rank detective corkboard. Every bid is a case file. The highest bidder becomes the prime suspect — biggest card, center of the board, red string running straight to it. Outbid them and the whole board reflows.',
  keywords: ['pay to rank', 'leaderboard', 'corkboard', 'startup directory', 'auction'],
  authors: [{ name: 'redstring.lol' }],
  openGraph: {
    type: 'website',
    url: SITE,
    siteName: 'redstring.lol',
    title: 'redstring.lol — pin your case, take the board',
    description:
      'Bids are area. The biggest bid gets the biggest case file and the red string running to it. Everyone else gets pinned to the corners.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'redstring.lol — pin your case, take the board',
    description:
      'Pay-to-rank, but the leaderboard is a detective corkboard. Bid more, get a bigger case file. The red string points at #1.',
  },
  icons: {
    // a pushpin with string trailing off it
    icon: [
      {
        url:
          'data:image/svg+xml,' +
          encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
              <path d="M4 29 C9 24 12 20 15 16" stroke="#b3121b" stroke-width="2.5" fill="none" stroke-linecap="round"/>
              <circle cx="18" cy="12" r="8" fill="#e8232f"/>
              <circle cx="15" cy="9" r="2.6" fill="#ff8f95"/>
            </svg>`,
          ),
        type: 'image/svg+xml',
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: '#63401f',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${specialElite.variable} ${archivo.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
