'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useVocabulario } from '@/hooks/useVocabulario';
import { TERMO_MAX, buscaApi, montarItens, podeBuscar, type ItemBusca, type ResultadoBusca } from '@/lib/busca';
import { filtrarTelas } from '@/lib/buscaTelas';

export type StatusBusca = 'ocioso' | 'buscando' | 'pronto' | 'erro' | 'bloqueada';

const ESPERA_MS = 250;

function hojeLocal(): string {
  const d = new Date();
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

export function useBuscaGeral(opcoes?: { aoEscolher?: () => void }) {
  const router = useRouter();
  const rotuloClientes = useVocabulario().cli.P;
  const [termo, setTermoBruto] = useState('');
  const [resultado, setResultado] = useState<{ q: string; dados: ResultadoBusca } | null>(null);
  const [status, setStatus] = useState<StatusBusca>('ocioso');
  const [aberta, setAberta] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const pedidoAtual = useRef(0);
  const aoEscolherRef = useRef(opcoes?.aoEscolher);
  aoEscolherRef.current = opcoes?.aoEscolher;

  const setTermo = useCallback((v: string) => {
    setTermoBruto(v.slice(0, TERMO_MAX));
    setAtivo(0);
    if (v.trim()) setAberta(true);
  }, []);

  useEffect(() => {
    const pedido = ++pedidoAtual.current;
    const q = termo.trim();
    if (!podeBuscar(q)) {
      setResultado(null);
      setStatus('ocioso');
      return;
    }
    setStatus('buscando');
    const controller = new AbortController();
    const timer = setTimeout(() => {
      buscaApi
        .buscar(q, controller.signal)
        .then((r) => {
          if (pedido !== pedidoAtual.current) return;
          setResultado({ q, dados: r });
          setStatus('pronto');
        })
        .catch((e: unknown) => {
          if (pedido !== pedidoAtual.current) return;
          setResultado(null);
          const codigo = (e as { response?: { status?: number } })?.response?.status;
          setStatus(codigo === 402 ? 'bloqueada' : 'erro');
        });
    }, ESPERA_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [termo]);

  const liberada = podeBuscar(termo);
  // Resultado de outro termo não vale: some assim que o termo muda, e só as telas ficam.
  const itens = useMemo(() => {
    if (!liberada) return [];
    const dados = resultado && resultado.q === termo.trim() ? resultado.dados : { clientes: [], agendamentos: [] };
    return montarItens(dados, filtrarTelas(termo, rotuloClientes), hojeLocal());
  }, [liberada, resultado, termo, rotuloClientes]);

  const escolher = useCallback(
    (item: ItemBusca) => {
      router.push(item.href);
      setTermoBruto('');
      setAtivo(0);
      setAberta(false);
      aoEscolherRef.current?.();
    },
    [router],
  );

  const aoTeclar = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (itens.length === 0) return;
        e.preventDefault();
        setAberta(true);
        const passo = e.key === 'ArrowDown' ? 1 : -1;
        setAtivo((i) => (i + passo + itens.length) % itens.length);
      } else if (e.key === 'Enter') {
        const item = itens[ativo];
        if (!item) return;
        e.preventDefault();
        escolher(item);
      } else if (e.key === 'Escape') {
        setAberta(false);
      }
    },
    [itens, ativo, escolher],
  );

  return { termo, setTermo, itens, status, aberta: aberta && liberada, setAberta, ativo, setAtivo, aoTeclar, escolher };
}
