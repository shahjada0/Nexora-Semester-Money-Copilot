import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SandboxBanner } from '@/components/SandboxBanner';
import { ViewModeProvider } from '@/components/ViewMode';

export const metadata: Metadata = {
  title: 'Semester Money Copilot by Nexora',
  description: 'An AI agent that plans, compares and safely completes student money tasks. Sandbox only.',
  icons: { icon: '/icon.png' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ViewModeProvider>
          <SandboxBanner />
          {children}
        </ViewModeProvider>
      </body>
    </html>
  );
}
