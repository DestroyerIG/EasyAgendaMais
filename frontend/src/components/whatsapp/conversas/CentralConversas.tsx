'use client';

interface CentralConversasProps {
  conectado: boolean;
}

/** Placeholder até a Task 10 trazer a central de conversas. */
export function CentralConversas({ conectado }: CentralConversasProps) {
  return <div data-conectado={conectado} />;
}
