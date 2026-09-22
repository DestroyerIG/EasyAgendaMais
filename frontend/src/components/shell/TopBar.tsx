import Image from 'next/image';
import easyAgendaLogo from '@/icons/easyagenda-logo.svg';

export function TopBar({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface px-4 lg:hidden">
      <Image src={easyAgendaLogo} alt="" width={28} height={28} className="h-7 w-7" />
      <p className="text-lg font-bold text-ink">{title}</p>
    </header>
  );
}
