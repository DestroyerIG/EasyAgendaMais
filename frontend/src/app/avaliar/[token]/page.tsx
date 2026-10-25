import { AvaliarAtendimento } from '@/components/avaliacao/AvaliarAtendimento';

export const metadata = { title: 'Avalie seu atendimento', robots: { index: false } };

export default async function AvaliarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AvaliarAtendimento token={token} />;
}
