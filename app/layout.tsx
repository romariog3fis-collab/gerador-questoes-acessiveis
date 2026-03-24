import type {Metadata} from 'next';
import { Inter } from 'next/font/google';
import './globals.css'; // Global styles
import { AuthProvider, AuthWrapper } from '../src/components/AuthWrapper';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Gerador de Questões Acessíveis',
  description: 'Crie materiais de avaliação adaptados para alunos com Necessidades Educacionais Especiais (NEE).',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="pt-BR" className={`${inter.variable} antialiased`}>
      <body suppressHydrationWarning className="font-sans">
        <ErrorBoundary>
          <AuthProvider>
            <AuthWrapper>
              {children}
            </AuthWrapper>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
