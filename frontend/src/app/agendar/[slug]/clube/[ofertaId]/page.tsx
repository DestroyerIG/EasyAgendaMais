import { AdesaoClube } from '@/components/clube/AdesaoClube';

export default async function AdesaoClubePage({ params }: { params: Promise<{ slug: string; ofertaId: string }> }) {
  const { slug, ofertaId } = await params;
  return <AdesaoClube slug={slug} ofertaId={ofertaId} />;
}
