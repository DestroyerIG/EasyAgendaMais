'use client';

import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/formatters';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { type FormaPagamentoClube, type Oferta, ROTULO_FORMA_CLUBE, clubeApi } from '@/lib/clube';
import { Button, Field, Input, Modal, Select } from '@/components/ui';

// Vende um plano ou pacote no balcão: escolhe a cliente, o plano e como ela pagou.
// "Pix a receber" manda o copia e cola no WhatsApp e o contrato só começa quando o pagamento for confirmado.

interface VincularModalProps {
  onClose: () => void;
  onVinculado: (pendente: boolean) => void;
}

interface Cliente { id: string; name: string; phone: string }
type Pagamento = FormaPagamentoClube | 'pix_receber';

export function VincularModal({ onClose, onVinculado }: VincularModalProps) {
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busca, setBusca] = useState('');
  const [clientId, setClientId] = useState('');
  const [ofertaId, setOfertaId] = useState('');
  const [pagamento, setPagamento] = useState<Pagamento>('pix');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    Promise.all([clubeApi.ofertas(), api.get<Cliente[]>('/clients')])
      .then(([o, c]) => {
        if (!ativo) return;
        const ativas = o.filter((x) => x.status === 'ativa');
        setOfertas(ativas);
        setOfertaId(ativas[0]?.id ?? '');
        setClientes(Array.isArray(c.data) ? c.data : []);
      })
      .catch((e) => ativo && setErro(getApiErrorMessage(e, 'Não foi possível carregar clientes e planos.')));
    return () => { ativo = false; };
  }, []);

  const encontradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const digitos = t.replace(/\D/g, '');
    if (!t) return clientes.slice(0, 8);
    return clientes.filter((c) => c.name.toLowerCase().includes(t) || (digitos && c.phone.includes(digitos))).slice(0, 8);
  }, [busca, clientes]);
  const oferta = ofertas.find((o) => o.id === ofertaId);
  const cliente = clientes.find((c) => c.id === clientId);

  const salvar = async () => {
    setErro(null);
    if (!clientId) return setErro('Escolha a cliente.');
    if (!ofertaId) return setErro('Escolha o plano ou pacote.');
    setSalvando(true);
    try {
      const pendente = pagamento === 'pix_receber';
      await clubeApi.vincular({ ofertaId, clientId, pagamento: { forma: pendente ? 'pix' : pagamento, pago: !pendente } });
      onVinculado(pendente);
    } catch (e) {
      setErro(getApiErrorMessage(e, 'Não foi possível vincular a cliente.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Vincular cliente a plano"
      icon="person_add"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} loading={salvando}>Vincular</Button>
        </>
      )}
    >
      <div className="space-y-4 text-[14px]">
        <Field id="vinc-busca" label="Cliente">
          <Input id="vinc-busca" value={cliente ? cliente.name : busca} placeholder="Buscar por nome ou telefone"
            onChange={(e) => { setClientId(''); setBusca(e.target.value); }} />
        </Field>
        {!cliente && (
          <ul aria-label="Clientes encontradas" className="max-h-48 divide-y divide-line overflow-y-auto rounded-control border border-line">
            {encontradas.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setClientId(c.id)} className="flex w-full justify-between px-3 py-2 text-left hover:bg-surface-2">
                  <span className="font-semibold text-ink">{c.name}</span>
                  <span className="text-muted">{c.phone}</span>
                </button>
              </li>
            ))}
            {encontradas.length === 0 && <li className="px-3 py-2 text-muted">Nenhuma cliente encontrada.</li>}
          </ul>
        )}
        <Field id="vinc-oferta" label="Plano ou pacote">
          <Select id="vinc-oferta" value={ofertaId} onChange={(e) => setOfertaId(e.target.value)}>
            {ofertas.map((o) => <option key={o.id} value={o.id}>{o.nome} · {formatCurrency(o.preco)}{o.tipo === 'clube' ? '/mês' : ''}</option>)}
          </Select>
        </Field>
        <Field id="vinc-pagamento" label="Pagamento">
          <Select id="vinc-pagamento" value={pagamento} onChange={(e) => setPagamento(e.target.value as Pagamento)}>
            {(Object.keys(ROTULO_FORMA_CLUBE) as FormaPagamentoClube[]).map((f) => <option key={f} value={f}>{ROTULO_FORMA_CLUBE[f]} (já recebido)</option>)}
            <option value="pix_receber">Pix a receber (enviar cobrança no WhatsApp)</option>
          </Select>
        </Field>
        <p className="text-[13px] text-muted">
          {pagamento === 'pix_receber'
            ? 'A cliente recebe o Pix copia e cola. O plano começa quando você confirmar o pagamento.'
            : `O plano começa hoje${oferta?.tipo === 'clube' ? ' e renova todo mês neste dia, com o Pix enviado 3 dias antes' : ''}.${pagamento === 'dinheiro' ? ' Dinheiro entra na gaveta do caixa de hoje.' : ''}`}
        </p>
        {erro && <p role="alert" className="text-danger">{erro}</p>}
      </div>
    </Modal>
  );
}
