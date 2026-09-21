import type { Metadata } from 'next';
import './globals.css';

/**
 * Root layout for the entire Next.js App Router tree (applies to every route,
 * including /login, /signup and every page under app/(app)/*). This is the
 * one place `<html>`/`<body>` are declared, global CSS is imported, and the
 * Google Fonts (Inter, JetBrains Mono) used across the whole design system
 * are loaded.
 *
 * Gotcha for a new engineer: this file renders for unauthenticated routes
 * too (login/signup) — it must not assume a session exists, and it must not
 * import anything that touches Supabase or cookies, or every route (even the
 * public ones) would pay for/depend on that.
 */
export const metadata: Metadata = {
  title: 'Prometeia Issue Tracker',
  description: "Prometeia's UAT/SIT issue tracking and KPI dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=JetBrains+Mono:wght@400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
