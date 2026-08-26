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
