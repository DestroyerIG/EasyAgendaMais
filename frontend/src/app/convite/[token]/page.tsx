import { ConviteProfissional } from '@/components/convite/ConviteProfissional';

export const metadata = { title: 'Convite · EasyAgenda+', robots: { index: false } };

export default async function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ConviteProfissional token={token} />;
}
