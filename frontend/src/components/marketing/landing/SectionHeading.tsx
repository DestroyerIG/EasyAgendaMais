export function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 text-center">
      <span className="text-xs font-bold uppercase tracking-widest text-brand">{eyebrow}</span>
      <h2 className="text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-[32px] lg:text-[36px]">
        {title}
      </h2>
      <p className="text-base text-muted">{subtitle}</p>
    </div>
  );
}
