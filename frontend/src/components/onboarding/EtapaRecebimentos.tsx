'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { Banner, Button, Field, Icon, Input, Select } from '@/components/ui';
import { CascaOnboarding } from './CascaOnboarding';
import { GATEWAYS, URL_TAXAS_INFINITEPAY, URL_TAXAS_MERCADO_PAGO, type GatewayCatalogo } from '@/components/recebimentos/catalogo';
import { GatewayLogo } from '@/components/recebimentos/GatewayLogo';
import { InfinitePayFormulario } from '@/components/recebimentos/InfinitePayFormulario';
import { recebimentosApi, type GatewayId } from '@/lib/recebimentos';
import type { Onboarding, TipoChavePix, onboardingApi } from '@/lib/onboarding';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { cn } from '@/lib/cn';

// Etapa 4 do onboarding: explica o sinal, deixa escolher como receber e quais serviços cobram sinal.

export type EscolhaRecebimento = 'mercadopago' | 'infinitepay' | 'pix' | 'nenhum';

/**
 * Mensagem do problema que impede seguir (null = pode continuar). O sinal sempre precisa de uma chave Pix
 * (digitada agora ou já salva): a página pública monta o Pix por ela, e com uma conta conectada ela é a reserva.
 */
export function erroDosRecebimentos(a: {
  escolha: EscolhaRecebimento | null; conectado: boolean; chave: string; servicosComSinal: number; temChavePix?: boolean;
}): string | null {
  const temChave = !!a.chave.trim() || !!a.temChavePix;
  if (!a.escolha) return 'Escolha como receber ou toque em Configurar depois.';
  if (a.escolha === 'nenhum') return null;
  if (a.escolha === 'pix' && !temChave) return 'Informe a chave Pix.';
  if ((a.escolha === 'mercadopago' || a.escolha === 'infinitepay') && !a.conectado && a.servicosComSinal > 0) {
    return 'Conecte a conta para cobrar o sinal.';
  }
  if (a.servicosComSinal > 0 && !temChave) return 'Informe a chave Pix para cobrar o sinal.';
  return null;
}

const TIPOS: { value: TipoChavePix; label: string }[] = [
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'email', label: 'E-mail' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'aleatoria', label: 'Chave aleatória' },
];

const PCT_PADRAO = 30;
const pctValido = (n: number) => (Number.isFinite(n) && n >= 1 ? Math.min(100, Math.round(n)) : PCT_PADRAO);
const ehGateway = (e: EscolhaRecebimento | null): e is GatewayId => e === 'mercadopago' || e === 'infinitepay';
const artigo = (id: string) => (id === 'infinitepay' ? 'a' : 'o');
const linkExterno = 'inline-flex items-center gap-1 font-semibold text-brand-text underline underline-offset-2';

interface Sinal { marcado: boolean; pct: number }

export function EtapaRecebimentos({ servicos, recebimentos, salvando, onVoltar, onPular, onSalvar, onConexaoMudou }: {
  servicos: Onboarding['servicos'];
  recebimentos: Onboarding['recebimentos'];
  salvando: boolean;
  onVoltar: () => void;
  onPular: () => void;
  onSalvar: (d: Parameters<typeof onboardingApi.salvarRecebimentos>[0]) => void;
  onConexaoMudou: () => void;
}) {
  const conexao = recebimentos.conexao;
  const [escolha, setEscolha] = useState<EscolhaRecebimento | null>(
    conexao ? conexao.gateway : recebimentos.temChavePix ? 'pix' : null,
  );
  const [tipo, setTipo] = useState<TipoChavePix>('telefone');
  const [chave, setChave] = useState('');
  const [sinais, setSinais] = useState<Record<string, Sinal>>(() =>
    Object.fromEntries(servicos.map((s) => [s.id, { marcado: s.sinalPct != null, pct: s.sinalPct ?? PCT_PADRAO }])),
  );
  const [indo, setIndo] = useState(false);
  const [erroConectar, setErroConectar] = useState<string | null>(null);

  // Na volta do Mercado Pago a conexão chega depois da primeira carga: marca o gateway que acabou de conectar,
  // sem apagar o que já foi digitado.
  const gatewayConectado = conexao?.gateway ?? null;
  const gatewayAnterior = useRef(gatewayConectado);
  useEffect(() => {
    if (gatewayConectado && gatewayConectado !== gatewayAnterior.current) setEscolha(gatewayConectado);
    gatewayAnterior.current = gatewayConectado;
  }, [gatewayConectado]);

  const conectado = ehGateway(escolha) && conexao?.gateway === escolha && conexao.situacao === 'ativa';
  // Quem já tem chave Pix salva pode seguir sem digitar de novo; a chave só vai se for preenchida.
  const temChave = !!chave.trim() || recebimentos.temChavePix;
  const temFormaDeReceber = conectado || (escolha === 'pix' && temChave);
  const comSinal = escolha === 'nenhum' ? 0 : servicos.filter((s) => sinais[s.id]?.marcado).length;
  // Sinais já salvos ficam à vista mesmo sem forma de receber, para poderem ser desmarcados.
  const mostrarSinais = !!escolha && escolha !== 'nenhum' && servicos.length > 0 && (temFormaDeReceber || comSinal > 0);
  const erro = erroDosRecebimentos({ escolha, conectado, chave, servicosComSinal: comSinal, temChavePix: recebimentos.temChavePix });

  const mudarSinal = (id: string, patch: Partial<Sinal>) =>
    setSinais((atual) => ({ ...atual, [id]: { ...atual[id], ...patch } }));

  const conectarMercadoPago = async () => {
    setIndo(true);
    setErroConectar(null);
    try {
      const { url } = await recebimentosApi.conectar('onboarding');
      window.location.assign(url);
    } catch (e) {
      setIndo(false);
      setErroConectar(getApiErrorMessage(e, 'Não foi possível abrir o Mercado Pago. Tente de novo.'));
    }
  };

  const salvar = () => {
    onSalvar({
      ...(escolha !== 'nenhum' && chave.trim() ? { chavePix: { chave: chave.trim(), tipo } } : {}),
      servicos: servicos.map((s) => {
        const sinal = sinais[s.id];
        return { id: s.id, sinalPct: escolha !== 'nenhum' && sinal?.marcado ? pctValido(sinal.pct) : null };
      }),
    });
  };

  const gateways = GATEWAYS.filter((g) => ['mercadopago', 'infinitepay', 'asaas', 'pagbank'].includes(g.id));

  return (
    <CascaOnboarding
      etapa={4}
      titulo="Como você quer receber o sinal?"
      descricao="O sinal é uma parte do preço que o cliente paga para reservar o horário. Com uma conta integrada, o pagamento é confirmado sozinho. Com o Pix manual, você confere o Pix e confirma a reserva."
      rodape={(
        <>
          <Button variant="ghost" onClick={onVoltar} aria-label="Voltar">
            <Icon name="arrow_back" size={18} /> <span className="hidden sm:inline">Voltar</span>
          </Button>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onPular}>Configurar depois</Button>
            <Button disabled={!!erro} loading={salvando} onClick={salvar}>
              Continuar <Icon name="arrow_forward" size={18} />
            </Button>
          </div>
        </>
      )}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {gateways.map((g) => {
          const outroConectado = !!conexao && conexao.gateway !== g.id && g.situacao === 'disponivel';
          const outro = conexao ? GATEWAYS.find((x) => x.id === conexao.gateway)?.nome : '';
          return (
            <Opcao
              key={g.id}
              selecionada={escolha === g.id}
              desabilitada={g.situacao !== 'disponivel' || outroConectado}
              onEscolher={() => setEscolha(g.id as GatewayId)}
              visual={<GatewayLogo nome={g.nome} logo={g.logo} className="h-9" />}
              titulo={g.nome}
              selo={g.situacao === 'em_breve' ? 'Em breve' : conexao?.gateway === g.id && conexao.situacao === 'ativa' ? 'Conectado' : undefined}
              texto={g.situacao === 'em_breve'
                ? undefined
                : outroConectado
                  ? `Você já recebe pel${artigo(conexao!.gateway)} ${outro}. Só uma conta pode ficar conectada.`
                  : g.descricaoCurta}
            />
          );
        })}
        <Opcao
          selecionada={escolha === 'pix'}
          onEscolher={() => setEscolha('pix')}
          visual={<IconeOpcao nome="pix" />}
          titulo="Pix manual"
          texto="O cliente paga na sua chave e você confere."
        />
        <Opcao
          selecionada={escolha === 'nenhum'}
          onEscolher={() => setEscolha('nenhum')}
          visual={<IconeOpcao nome="money_off" />}
          titulo="Não vou cobrar sinal agora"
          texto="Você pode configurar o sinal depois, em Ajustes › Recebimentos."
        />
      </div>

      {escolha === 'mercadopago' && (
        <PainelGateway
          gateway={GATEWAYS.find((g) => g.id === 'mercadopago')!}
          urlTaxas={URL_TAXAS_MERCADO_PAGO}
          conexao={conexao?.gateway === 'mercadopago' ? conexao : null}
          avisoReconectar="A autorização do Mercado Pago venceu ou foi retirada. Conecte de novo para os sinais serem confirmados sozinhos."
          conectar={(
            <>
              {erroConectar && <Banner tone="danger" variant="inline">{erroConectar}</Banner>}
              <Button onClick={() => void conectarMercadoPago()} loading={indo} className="w-full sm:w-auto">
                Conectar com o Mercado Pago
              </Button>
            </>
          )}
        />
      )}

      {escolha === 'infinitepay' && (
        <PainelGateway
          gateway={GATEWAYS.find((g) => g.id === 'infinitepay')!}
          urlTaxas={URL_TAXAS_INFINITEPAY}
          conexao={conexao?.gateway === 'infinitepay' ? conexao : null}
          avisoReconectar="A InfinitePay recusou a chave ou ela foi desativada. Cole uma chave nova para reconectar."
          conectar={<InfinitePayFormulario onConectado={() => onConexaoMudou()} />}
        />
      )}

      {escolha && escolha !== 'nenhum' && (
        <section className="space-y-3 rounded-card border border-line bg-surface p-4">
          <div>
            <h2 className="text-[15px] font-bold text-ink">{escolha === 'pix' ? 'Sua chave Pix' : 'Chave Pix (reserva)'}</h2>
            {escolha !== 'pix' && (
              <p className="text-[14px] text-muted">Sua página usa a chave Pix como reserva e para o cliente que prefere pagar direto.</p>
            )}
          </div>
          {recebimentos.temChavePix && (
            <p className="text-[14px] text-muted">Você já tem uma chave Pix salva. Preencha só se quiser trocar.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
            <Field id="onb-pix-tipo" label="Tipo de chave">
              <Select id="onb-pix-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoChavePix)}>
                {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </Field>
            <Field id="onb-pix-chave" label={escolha === 'pix' ? 'Chave Pix' : 'Chave Pix (reserva)'}>
              <Input
                id="onb-pix-chave" value={chave} onChange={(e) => setChave(e.target.value)}
                autoComplete="off" autoCapitalize="none" spellCheck={false}
              />
            </Field>
          </div>
        </section>
      )}

      {mostrarSinais && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-bold text-ink">Quais serviços exigem sinal?</h2>
            <p className="text-[14px] text-muted">O cliente paga essa parte do preço ao agendar.</p>
          </div>
          <ul className="space-y-3">
            {servicos.map((s) => {
              const sinal = sinais[s.id] ?? { marcado: false, pct: PCT_PADRAO };
              return (
                <li
                  key={s.id}
                  className={cn('flex flex-wrap items-center justify-between gap-3 rounded-card border bg-surface p-4', sinal.marcado ? 'border-brand/60' : 'border-line')}
                >
                  <label className="flex min-h-11 flex-1 items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-5 w-5 shrink-0 accent-brand"
                      checked={sinal.marcado}
                      onChange={(e) => mudarSinal(s.id, { marcado: e.target.checked })}
                      aria-label={`Exigir sinal em ${s.nome}`}
                    />
                    <span className="min-w-0">
                      <span className="block font-bold text-ink break-words">{s.nome}</span>
                      <span className="block text-[13px] text-muted">Exigir sinal</span>
                    </span>
                  </label>
                  {sinal.marcado && (
                    <span className="flex items-center gap-2">
                      <Input
                        type="number" inputMode="numeric" min={1} max={100} step={1}
                        className="w-20"
                        aria-label={`Sinal de ${s.nome} (%)`}
                        value={Number.isFinite(sinal.pct) ? sinal.pct : ''}
                        onChange={(e) => mudarSinal(s.id, { pct: e.target.value === '' ? Number.NaN : Number(e.target.value) })}
                        onBlur={() => mudarSinal(s.id, { pct: pctValido(sinal.pct) })}
                      />
                      <span className="text-[14px] font-semibold text-muted">% do preço</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {erro && <p role="alert" className="text-[14px] font-semibold text-danger">{erro}</p>}
    </CascaOnboarding>
  );
}

function IconeOpcao({ nome }: { nome: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-surface-2 text-brand-text">
      <Icon name={nome} size={22} />
    </span>
  );
}

function Opcao({ selecionada, desabilitada, onEscolher, visual, titulo, selo, texto }: {
  selecionada: boolean; desabilitada?: boolean; onEscolher: () => void;
  visual: ReactNode; titulo: string; selo?: string; texto?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selecionada}
      disabled={desabilitada}
      onClick={onEscolher}
      className={cn(
        'flex min-h-11 w-full items-start gap-3 rounded-card border bg-surface p-4 text-left transition-colors',
        selecionada ? 'border-brand ring-2 ring-brand/30' : 'border-line',
        desabilitada ? 'cursor-not-allowed opacity-60' : !selecionada && 'hover:border-brand/60',
      )}
    >
      {visual}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-ink">{titulo}</span>
          {selo && (
            <span className={cn(
              'rounded-full px-2 py-0.5 text-[12px] font-semibold',
              selo === 'Conectado' ? 'bg-success/12 text-success-text' : 'bg-surface-2 text-muted',
            )}>
              {selo}
            </span>
          )}
        </span>
        {texto && <span className="mt-0.5 block text-[13px] text-muted">{texto}</span>}
      </span>
    </button>
  );
}

function PainelGateway({ gateway, urlTaxas, conexao, avisoReconectar, conectar }: {
  gateway: GatewayCatalogo;
  urlTaxas: string;
  conexao: NonNullable<Onboarding['recebimentos']['conexao']> | null;
  avisoReconectar: string;
  conectar: ReactNode;
}) {
  const art = artigo(gateway.id);
  return (
    <section className="space-y-4 rounded-card border border-line bg-surface p-4">
      <h2 className="text-[15px] font-bold text-ink">Receber o sinal pel{art} {gateway.nome}</h2>

      {conexao && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-2 px-3 py-2 text-[14px]">
          <p className="min-w-0 font-semibold text-ink break-words">{conexao.contaNome || 'Conta conectada'}</p>
          {conexao.situacao === 'ativa' && (
            <span className="flex items-center gap-1 font-semibold text-success-text">
              <Icon name="check_circle" size={18} filled /> Conectado
            </span>
          )}
        </div>
      )}

      {conexao?.situacao === 'ativa' ? (
        <p className="text-[14px] text-muted">Os novos sinais serão confirmados sozinhos.</p>
      ) : (
        <>
          {conexao ? (
            <Banner tone="warning" variant="inline">{avisoReconectar}</Banner>
          ) : (
            <ol className="space-y-4">
              {gateway.passos.map((p, i) => (
                <li key={p.titulo} className="flex gap-3">
                  <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-on-brand">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold text-ink">{p.titulo}</h3>
                    <p className="mt-0.5 text-[14px] text-muted">{p.texto}</p>
                    {p.links ? (
                      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
                        {p.links.map((l) => (
                          <a key={l.rotulo} href={l.url} target="_blank" rel="noopener noreferrer" className={cn(linkExterno, 'min-h-11 sm:min-h-0')}>
                            {l.rotulo} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          </a>
                        ))}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}

          <Banner tone="info" variant="inline" className="flex-col items-start">
            <ul className="list-disc space-y-1 pl-4">
              {gateway.avisos.map((a) => <li key={a}>{a}</li>)}
            </ul>
            <a href={urlTaxas} target="_blank" rel="noopener noreferrer" className={linkExterno}>
              Ver a tabela de taxas d{art} {gateway.nome} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </Banner>

          {conectar}
        </>
      )}
    </section>
  );
}
