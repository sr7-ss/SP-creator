import type { Metadata } from 'next';
import { Geist, Geist_Mono, Syne, Space_Mono } from 'next/font/google';
import './globals.css';
import ResizableLayout from '@/components/layout/ResizableLayout';
import AppProvider from '@/components/layout/AppProvider';
import { SessionProvider } from 'next-auth/react';
import { Toaster } from 'sonner';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const syne = Syne({
  variable: '--font-syne',
  subsets: ['latin'],
  weight: ['400', '500', '700', '800'],
});

const spaceMono = Space_Mono({
  variable: '--font-space-mono',
  subsets: ['latin'],
  weight: ['400', '700'],
});

export const metadata: Metadata = {
  title: 'SP Creator - Product Selling Point Packaging Tool',
  description: 'Input product and competitor specs, auto-generate optimal selling point packaging strategy',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${syne.variable} ${spaceMono.variable} antialiased bg-slate-50/30`}
      >
        <SessionProvider>
          <AppProvider>
            <Toaster position="top-center" richColors closeButton />
            <ResizableLayout>{children}</ResizableLayout>
          </AppProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
