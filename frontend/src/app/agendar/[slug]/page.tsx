import { PublicBookingFlow } from '@/components/publicBooking/PublicBookingFlow';

export default async function AgendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicBookingFlow slug={slug} />;
}
