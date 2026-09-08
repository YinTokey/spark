import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Spark by PrepVid — Ideas move with you.',
  description: 'A wearable AI companion for creators. Capture thoughts anywhere, let AI shape your ideas, and turn them into content.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return <html lang="en"><body>{children}</body></html>;
}
