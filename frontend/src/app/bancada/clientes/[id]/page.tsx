import { FichaRapida } from '@/components/bancada/FichaRapida';

export default async function FichaRapidaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FichaRapida clientId={id} />;
}
