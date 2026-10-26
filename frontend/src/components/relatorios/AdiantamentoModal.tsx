'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/formatters';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { type Adiantamento, dataBr, hojeLocal, relatoriosApi } from '@/lib/relatorios';
import api from '@/lib/api';
import { Button, Field, Icon, Input, Modal, Select } from '@/components/ui';
import { useVocabulario } from '@/hooks/useVocabulario';

// Lança um adiantamento para a profissional e lista os que ainda estão em aberto. O valor
// é descontado no próximo repasse; não mexe no Caixa.

interface AdiantamentoModalProps {
  profissionais: { id: string; nome: string }[];
  onClose: () => void;
  onSalvo: () => void;
}

export function AdiantamentoModal({ profissionais: daApuracao, onClose, onSalvo }: AdiantamentoModalProps) {
  const { prof } = useVocabulario();
  const hoje = hojeLocal();
  const [profissionais, setProfissionais] = useState(daApuracao);
  const [professionalId, setProfessionalId] = useState(daApuracao[0]?.id ?? '');
  const [valor, setValor] = useState('');
  const [data, setData] = useState(hoje);
  const [descricao, setDescricao] = useState('');
  const [abertos, setAbertos] = useState<Adiantamento[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // A apuração só traz quem teve comanda; o adiantamento pode ir para qualquer profissional ativa.
  useEffect(() => {
    api.get<{ id: string; name: string }[]>('/business/professionals')
      .then((r) => {
        const lista = Array.isArray(r.data) ? r.data.map((p) => ({ id: p.id, nome: p.name })) : [];
        if (lista.length) {
          setProfissionais(lista);
          setProfessionalId((atual) => atual || lista[0].id);
        }
      })
      .catch(() => undefined);
  }, []);

  const carregarAbertos = useCallback(async (id: string) => {
    if (!id) return setAbertos([]);
    try {
      setAbertos(await relatoriosApi.adiantamentos({ professionalId: id, abertos: true }));
    } catch {
      setAbertos([]);
    }
  }, []);

  useEffect(() => {
    void carregarAbertos(professionalId);
  }, [carregarAbertos, professionalId]);

  const salvar = async () => {
    const numero = Number(valor.replace(',', '.'));
    if (!professionalId) return setErro(`Escolha ${prof.oS}.`);
    if (!(numero > 0)) return setErro('Informe um valor maior que zero.');
    setEnviando(true);
    setErro(null);
    try {
      await relatoriosApi.lancarAdiantamento({ professionalId, valor: numero, data, descricao: descricao.trim() || null });
      onSalvo();
    } catch (e) {
      setErro(getApiErrorMessage(e, 'Não foi possível lançar o adiantamento.'));
    } finally {
      setEnviando(false);
    }
  };

  const excluir = async (a: Adiantamento) => {
    try {
      await relatoriosApi.excluirAdiantamento(a.id);
      await carregarAbertos(professionalId);
    } catch (e) {
      setErro(getApiErrorMessage(e, 'Não foi possível excluir o adiantamento.'));
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Lançar adiantamento"
      icon="payments"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} loading={enviando}>Lançar</Button>
        </>
      )}
    >
      <div className="space-y-4 text-[14px]">
        <Field id="adiant-prof" label={prof.S}>
          <Select id="adiant-prof" value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
            {profissionais.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="adiant-valor" label="Valor (R$)">
            <Input id="adiant-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
          </Field>
          <Field id="adiant-data" label="Data">
            <Input id="adiant-data" type="date" max={hoje} value={data} onChange={(e) => setData(e.target.value)} />
          </Field>
        </div>
        <Field id="adiant-desc" label="Descrição (opcional)">
          <Input id="adiant-desc" maxLength={255} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </Field>
        <p className="text-[13px] text-muted">
          O valor é descontado no próximo repasse. Se saiu dinheiro da gaveta, lance também a sangria no Caixa.
        </p>
        {abertos.length > 0 && (
          <div className="space-y-2">
            <p className="text-[13px] font-semibold text-muted">Em aberto</p>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {abertos.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span>
                    {dataBr(a.data)} · {formatCurrency(a.saldo)}
                    {a.valorAbatido > 0 && <span className="text-muted"> (de {formatCurrency(a.valor)})</span>}
                    {a.descricao && <span className="text-muted"> · {a.descricao}</span>}
                  </span>
                  {a.valorAbatido === 0 && (
                    <Button size="sm" variant="ghost" aria-label={`Excluir adiantamento de ${dataBr(a.data)}`} onClick={() => excluir(a)}>
                      <Icon name="delete" size={16} />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {erro && <p role="alert" className="text-danger">{erro}</p>}
      </div>
    </Modal>
  );
}
