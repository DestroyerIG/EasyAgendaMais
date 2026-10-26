'use client';

import { useAuth } from '@/contexts/AuthContext';
import { GoogleAgendaCard } from '@/components/googleAgenda/GoogleAgendaCard';

// Ajustes › Google Agenda (fase 7): só a dona conecta a agenda do negócio, em qualquer plano.
export function GoogleAgendaSection() {
  const { user } = useAuth();
  if (user?.role !== 'tenant_admin') return null;
  return <GoogleAgendaCard para="negocio" />;
}
