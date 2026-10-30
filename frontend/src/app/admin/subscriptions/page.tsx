import { redirect } from 'next/navigation';

// Rota antiga: as assinaturas com problema agora são os negócios em carência.
export default function AdminSubscriptionsPage() {
  redirect('/admin/negocios?status=carencia');
}
