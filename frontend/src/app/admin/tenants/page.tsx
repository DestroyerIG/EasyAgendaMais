import { redirect } from 'next/navigation';

// Rota antiga: as contas agora ficam em Negócios.
export default function AdminTenantsPage() {
  redirect('/admin/negocios');
}
