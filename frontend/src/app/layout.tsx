import '../styles/globals.css'
import { ToastProvider } from '@/components/Toast'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import localFont from 'next/font/local'
import easyAgendaLogo from '@/icons/easyagenda-logo.png'

const plusJakartaSans = localFont({
  src: '../assets/fonts/plus-jakarta-sans-latin.woff2',
  variable: '--font-sans',
  weight: '200 800',
  style: 'normal',
  display: 'swap',
});

const spaceGrotesk = localFont({
  src: '../assets/fonts/space-grotesk-latin.woff2',
  variable: '--font-display',
  weight: '300 700',
  style: 'normal',
  display: 'swap',
});

export const metadata = {
  title: 'EasyAgenda+ - Gestão para Negócios de Beleza',
  description: 'EasyAgenda+ é a plataforma de agendamentos, clientes, financeiro e crescimento previsível para negócios de beleza e bem-estar.',
  keywords: 'easyagenda, agendamento online, negócios de beleza, bem-estar, gestão financeira, sistema de agendamento',
  openGraph: {
    title: 'EasyAgenda+ - Gestão para Negócios de Beleza',
    description: 'Controle total da operação do seu negócio com agendamentos, equipe, clientes e financeiro em um só lugar.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EasyAgenda+ - Gestão para Negócios de Beleza',
    description: 'Controle total da operação do seu negócio com agendamentos, equipe, clientes e financeiro em um só lugar.',
  },
  icons: {
    icon: easyAgendaLogo.src,
    shortcut: easyAgendaLogo.src,
    apple: easyAgendaLogo.src,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head />
      <body className={`${plusJakartaSans.variable} ${spaceGrotesk.variable}`}>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:bg-brand focus:text-on-brand focus:px-4 focus:py-2 focus:rounded-lg focus:font-bold">
          Pular para o conteúdo
        </a>
        <ThemeProvider>
          <ErrorBoundary>
            <ToastProvider>
              <AuthProvider>
                {children}
              </AuthProvider>
            </ToastProvider>
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  )
}
