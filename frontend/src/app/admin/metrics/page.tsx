import { redirect } from 'next/navigation';

// Rota antiga: as métricas agora ficam na visão geral.
export default function AdminMetricsPage() {
  redirect('/admin');
}
