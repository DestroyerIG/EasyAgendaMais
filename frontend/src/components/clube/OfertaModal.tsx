'use client';

import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/formatters';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { cn } from '@/lib/cn';
import { type Oferta, type OfertaInput, type TipoOferta, clubeApi } from '@/lib/clube';
import { Button, Field, Input, Modal, Select, Switch, Textarea } from '@/components/ui';
import { useVocabulario } from '@/hooks/useVocabulario';

// Criar ou editar um clube (assinatura mensal) ou pacote (sessões pagas antes).
// Preço, sessões e valor por sessão ficam gravados em cada contrato vendido: editar não muda quem já comprou.

interface OfertaModalProps {
  oferta: Oferta | null;
  onClose: () => void;
  onSalva: (o: Oferta) => void;
}

interface Item { id: string; name: string; price?: number; active?: boolean }

const numero = (v: string) => Number(v.replace(/\./g, '').replace(',', '.'));
const moeda = (v: number) => (v ? v.toFixed(2).replace('.', ',') : '');

export function OfertaModal({ oferta, onClose, onSalva }: OfertaModalProps) {
  const [tipo, setTipo] = useState<TipoOferta>(oferta?.tipo ?? 'clube');
  const { prof, adaptar } = useVocabulario();
  const [nome, setNome] = useState(oferta?.nome ?? '');
  const [descricao, setDescricao] = useState(oferta?.descricao ?? '');
  const [preco, setPreco] = useState(moeda(oferta?.preco ?? 0));
  const [servicos, setServicos] = useState<string[]>(oferta?.servicos.map((s) => s.id) ?? []);
  const [profissionais, setProfissionais] = useState<string[]>(oferta?.profissionais.map((p) => p.id) ?? []);
  const [ilimitado, setIlimitado] = useState(oferta ? oferta.tipo === 'clube' && oferta.sessoesPorCiclo === null : false);
  const [sessoesPorCiclo, setSessoesPorCiclo] = useState(String(oferta?.sessoesPorCiclo ?? 2));
  const [sessoesReferencia, setSessoesReferencia] = useState(String(oferta?.sessoesReferencia ?? 4));
  const [intervalo, setIntervalo] = useState(String(oferta?.intervaloMinimoDias ?? 0));
  const [totalSessoes, setTotalSessoes] = useState(String(oferta?.totalSessoes ?? 10));
  const [validadeDias, setValidadeDias] = useState(String(oferta?.validadeDias ?? 180));
  const [desconto, setDesconto] = useState(String(oferta?.descontoExtrasPct ?? 0));
  const [faltaDebita, setFaltaDebita] = useState(oferta?.faltaDebita ?? false);
  const [publica, setPublica] = useState(oferta?.publica ?? false);
  const [beneficios, setBeneficios] = useState((oferta?.beneficios ?? []).join('\n'));
  const [listaServicos, setListaServicos] = useState<Item[]>([]);
  const [listaProfissionais, setListaProfissionais] = useState<Item[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    Promise.all([api.get<Item[]>('/business/services'), api.get<Item[]>('/business/professionals')])
      .then(([s, p]) => {
        if (!ativo) return;
        setListaServicos((Array.isArray(s.data) ? s.data : []).filter((x) => x.active !== false || servicos.includes(x.id)));
        setListaProfissionais((Array.isArray(p.data) ? p.data : []).filter((x) => x.active !== false || profissionais.includes(x.id)));
      })
      .catch((e) => ativo && setErro(getApiErrorMessage(e, adaptar('Não foi possível carregar serviços e profissionais.'))));
    return () => { ativo = false; };
    // Carrega uma vez; as seleções iniciais só servem para não esconder itens inativos já escolhidos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sessoesDoPreco = tipo === 'pacote' ? Number(totalSessoes) : ilimitado ? Number(sessoesReferencia) : Number(sessoesPorCiclo);
  const valorSessao = useMemo(() => {
    const p = numero(preco);
    return p > 0 && sessoesDoPreco > 0 ? Math.floor((Math.round(p * 100)) / sessoesDoPreco) / 100 : 0;
  }, [preco, sessoesDoPreco]);
  const avulso = listaServicos.filter((s) => servicos.includes(s.id)).reduce((m, s) => Math.max(m, Number(s.price ?? 0)), 0);

  const alternar = (lista: string[], id: string) => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

  const salvar = async () => {
    setErro(null);
    const p = numero(preco);
    if (!nome.trim()) return setErro('Dê um nome ao plano.');
    if (!(p > 0)) return setErro('Informe um preço maior que zero.');
    if (servicos.length === 0) return setErro('Escolha ao menos um serviço incluso.');
    const dados: OfertaInput = {
      tipo, nome: nome.trim(), descricao: descricao.trim() || null, preco: Math.round(p * 100) / 100,
      servicos, profissionais,
      beneficios: beneficios.split('\n').map((b) => b.trim()).filter(Boolean).slice(0, 6),
      descontoExtrasPct: Number(desconto) || 0, faltaDebita, publica: tipo === 'clube' && publica,
      sessoesPorCiclo: tipo === 'clube' && !ilimitado ? Number(sessoesPorCiclo) : null,
      sessoesReferencia: Number(sessoesReferencia) || 4,
      intervaloMinimoDias: Number(intervalo) || 0,
      totalSessoes: tipo === 'pacote' ? Number(totalSessoes) : null,
      validadeDias: tipo === 'pacote' ? Number(validadeDias) : null,
    };
    setSalvando(true);
    try {
      onSalva(oferta ? await clubeApi.editarOferta(oferta.id, dados) : await clubeApi.criarOferta(dados));
    } catch (e) {
      setErro(getApiErrorMessage(e, 'Não foi possível salvar o plano.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      telaCheiaNoCelular
      title={oferta ? `Editar ${oferta.nome}` : 'Novo plano ou pacote'}
      description="Contratos já vendidos mantêm o preço e as sessões da venda."
      icon="loyalty"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} loading={salvando}>{oferta ? 'Salvar alterações' : 'Criar'}</Button>
        </>
      )}
    >
      <div className="space-y-5 text-[14px]">
        {!oferta && (
          <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-2 gap-2">
            {([
              ['clube', 'Clube mensal', 'Assinatura com sessões por mês'],
              ['pacote', 'Pacote de sessões', 'Sessões pagas antes, com validade'],
            ] as const).map(([v, titulo, legenda]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={tipo === v}
                onClick={() => setTipo(v)}
                className={cn(
                  'rounded-control border p-3 text-left transition-colors',
                  tipo === v ? 'border-brand bg-brand/8' : 'border-line bg-surface hover:border-brand/50',
                )}
              >
                <span className="block font-semibold text-ink">{titulo}</span>
                <span className="block text-[12px] text-muted">{legenda}</span>
              </button>
            ))}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
          <Field id="of-nome" label="Nome" required>
            <Input id="of-nome" value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} placeholder={tipo === 'clube' ? 'Mãos sempre feitas' : '10 sessões de drenagem'} />
          </Field>
          <Field id="of-preco" label={tipo === 'clube' ? 'Mensalidade (R$)' : 'Preço do pacote (R$)'} required>
            <Input id="of-preco" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="0,00" />
          </Field>
        </div>

        <Field id="of-desc" label="Descrição (opcional)">
          <Textarea id="of-desc" rows={2} maxLength={1000} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-[13px] font-semibold text-ink">Serviços inclusos</legend>
          <div className="flex flex-wrap gap-2">
            {listaServicos.map((s) => (
              <label key={s.id} className={cn('flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[13px]',
                servicos.includes(s.id) ? 'border-brand bg-brand/8 text-ink' : 'border-line text-muted')}>
                <input type="checkbox" className="sr-only" checked={servicos.includes(s.id)} onChange={() => setServicos(alternar(servicos, s.id))} />
                {s.name}
              </label>
            ))}
            {listaServicos.length === 0 && <p className="text-[13px] text-muted">Cadastre serviços em Serviços e equipe.</p>}
          </div>
        </fieldset>

        {tipo === 'clube' ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="of-sessoes" label="Sessões por mês">
              <Select id="of-sessoes" value={ilimitado ? 'ilimitado' : sessoesPorCiclo}
                onChange={(e) => { const v = e.target.value; setIlimitado(v === 'ilimitado'); if (v !== 'ilimitado') setSessoesPorCiclo(v); }}>
                {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => <option key={n} value={String(n)}>{n}</option>)}
                <option value="ilimitado">Ilimitado</option>
              </Select>
            </Field>
            {ilimitado && (
              <Field id="of-ref" label="Sessões de referência" hint="Só para calcular a comissão">
                <Input id="of-ref" type="number" min={1} max={31} value={sessoesReferencia} onChange={(e) => setSessoesReferencia(e.target.value)} />
              </Field>
            )}
            <Field id="of-intervalo" label="Intervalo mínimo (dias)">
              <Input id="of-intervalo" type="number" min={0} max={60} value={intervalo} onChange={(e) => setIntervalo(e.target.value)} />
            </Field>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="of-total" label="Total de sessões">
              <Input id="of-total" type="number" min={2} max={100} value={totalSessoes} onChange={(e) => setTotalSessoes(e.target.value)} />
            </Field>
            <Field id="of-validade" label="Validade" hint="Contada da 1ª sessão">
              <Select id="of-validade" value={validadeDias} onChange={(e) => setValidadeDias(e.target.value)}>
                {[[30, '1 mês'], [60, '2 meses'], [90, '3 meses'], [120, '4 meses'], [180, '6 meses'], [365, '1 ano'], [730, '2 anos']].map(([d, r]) => (
                  <option key={d} value={String(d)}>{r}</option>
                ))}
              </Select>
            </Field>
            <Field id="of-intervalo" label="Intervalo mínimo (dias)">
              <Input id="of-intervalo" type="number" min={0} max={60} value={intervalo} onChange={(e) => setIntervalo(e.target.value)} />
            </Field>
          </div>
        )}

        <p className="rounded-control border border-line bg-surface-2 p-3 text-[13px] text-muted">
          Valor por sessão: <strong className="text-ink tabular-nums">{formatCurrency(valorSessao)}</strong>
          {avulso > 0 && valorSessao > 0 && valorSessao < avulso ? ` (avulso ${formatCurrency(avulso)})` : ''}.
          A comissão da sessão coberta é calculada sobre este valor.
        </p>

        <fieldset className="space-y-2">
          <legend className="text-[13px] font-semibold text-ink">{prof.P}</legend>
          <p className="text-[12px] text-muted">Sem marcar nenhuma, vale com todas.</p>
          <div className="flex flex-wrap gap-2">
            {listaProfissionais.map((p) => (
              <label key={p.id} className={cn('flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[13px]',
                profissionais.includes(p.id) ? 'border-brand bg-brand/8 text-ink' : 'border-line text-muted')}>
                <input type="checkbox" className="sr-only" checked={profissionais.includes(p.id)} onChange={() => setProfissionais(alternar(profissionais, p.id))} />
                {p.name}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="of-desconto" label="Desconto nos outros itens (%)" hint="Vale na comanda de quem tem o plano">
            <Input id="of-desconto" type="number" min={0} max={100} value={desconto} onChange={(e) => setDesconto(e.target.value)} />
          </Field>
          <Field id="of-beneficios" label="Benefícios (um por linha, até 6)">
            <Textarea id="of-beneficios" rows={3} value={beneficios} onChange={(e) => setBeneficios(e.target.value)} />
          </Field>
        </div>

        <Switch checked={faltaDebita} onCheckedChange={setFaltaDebita} label="Falta debita sessão"
          description="Marcar o agendamento como faltou consome uma sessão do saldo." />
        {tipo === 'clube' && (
          <Switch checked={publica} onCheckedChange={setPublica} label="Mostrar na Minha página"
            description={adaptar('A cliente assina pela página pública e paga o primeiro Pix. A assinatura começa quando você confirmar.')} />
        )}

        {erro && <p role="alert" className="text-danger">{erro}</p>}
      </div>
    </Modal>
  );
}
