import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Agent Workflow Builder',
  description: 'Build and run AI agent workflows with Hasura and PostgreSQL.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
