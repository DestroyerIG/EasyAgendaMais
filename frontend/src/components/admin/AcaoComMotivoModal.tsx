'use client';

import { useState } from 'react';
import { Modal, Button, Field, Input, Select, Textarea } from '@/components/ui';

const MOTIVO_MINIMO = 3;
const MOTIVO_MAXIMO = 255;
const DIAS_MINIMO = 1;
const DIAS_MAXIMO = 30;

export interface CampoEscolha {
  rotulo: string;
  opcoes: Array<{ valor: string; rotulo: string }>;
  /** Valor já escolhido. Fora das opções (ex.: ''), o operador precisa escolher antes de confirmar. */
  inicial: string;
}

export interface AcaoComMotivoModalProps {
  titulo: string;
  descricao: string;
  rotuloConfirmar: string;
  /** Ação destrutiva: o botão de confirmar fica vermelho. */
  perigo?: boolean;
  /** Mostra o campo de dias (estender o teste grátis). */
  campoDias?: boolean;
  /** Mostra uma escolha (mudar plano, mudar status). O valor escolhido vem no 3º argumento. */
  campoEscolha?: CampoEscolha;
  /** Mostra o campo de valor mensal em reais (valor combinado do Salão). */
  campoValor?: boolean;
  enviando?: boolean;
  onConfirmar: (motivo: string, dias?: number, escolha?: string, valor?: number) => void;
  onFechar: () => void;
}

// Toda ação do SuperAdmin pede motivo (mínimo de 3 caracteres), gravado na auditoria.
// A tela monta o modal só quando a ação está aberta, então o estado começa limpo a cada vez.
export function AcaoComMotivoModal({
  titulo, descricao, rotuloConfirmar, perigo = false, campoDias = false, campoEscolha, campoValor = false, enviando = false, onConfirmar, onFechar,
}: AcaoComMotivoModalProps) {
  const [motivo, setMotivo] = useState('');
  const [dias, setDias] = useState('7');
  const [valor, setValor] = useState('');
  const ehOpcao = (valor: string) => campoEscolha?.opcoes.some((opcao) => opcao.valor === valor) ?? false;
  // Sem inicial válida (ex.: plano fora do catálogo) o select começa em "Escolha uma opção".
  const semInicialValida = campoEscolha !== undefined && !ehOpcao(campoEscolha.inicial);
  const [escolha, setEscolha] = useState(campoEscolha && !semInicialValida ? campoEscolha.inicial : '');

  const motivoLimpo = motivo.trim();
  const diasNumero = Number(dias);
  const diasValidos = Number.isInteger(diasNumero) && diasNumero >= DIAS_MINIMO && diasNumero <= DIAS_MAXIMO;
  const escolhaValida = !campoEscolha || ehOpcao(escolha);
  // Aceita vírgula ou ponto como separador decimal, até duas casas.
  const valorNumero = /^\d{1,5}([.,]\d{1,2})?$/.test(valor.trim()) ? Number(valor.trim().replace(',', '.')) : NaN;
  const valorValido = Number.isFinite(valorNumero) && valorNumero >= 1 && valorNumero <= 99999;
  const podeConfirmar =
    motivoLimpo.length >= MOTIVO_MINIMO && (!campoDias || diasValidos) && escolhaValida && (!campoValor || valorValido);

  const confirmar = () => {
    if (!podeConfirmar) return;
    const diasEnviados = campoDias ? diasNumero : undefined;
    if (campoValor) onConfirmar(motivoLimpo, diasEnviados, campoEscolha ? escolha : undefined, valorNumero);
    else if (campoEscolha) onConfirmar(motivoLimpo, diasEnviados, escolha);
    else onConfirmar(motivoLimpo, diasEnviados);
  };

  // Enquanto a ação está sendo enviada, Esc, o fundo e o X não fecham o modal.
  const fechar = enviando ? () => {} : onFechar;

  return (
    <Modal
      isOpen
      onClose={fechar}
      title={titulo}
      icon={perigo ? 'warning' : 'edit_note'}
      footer={(
        <>
          <Button variant="secondary" onClick={onFechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button variant={perigo ? 'danger' : 'primary'} onClick={confirmar} loading={enviando} disabled={!podeConfirmar}>
            {rotuloConfirmar}
          </Button>
        </>
      )}
    >
      <div className="flex flex-col gap-4">
        <p className="text-[15px] text-muted">{descricao}</p>

        {campoEscolha ? (
          <Field id="acao-escolha" label={campoEscolha.rotulo} required>
            <Select id="acao-escolha" value={escolha} onChange={(event) => setEscolha(event.target.value)}>
              {semInicialValida && (
                <option value="" disabled>
                  Escolha uma opção
                </option>
              )}
              {campoEscolha.opcoes.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>
                  {opcao.rotulo}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {campoDias ? (
          <Field
            id="acao-dias"
            label="Dias"
            hint={`De ${DIAS_MINIMO} a ${DIAS_MAXIMO} dias.`}
            error={dias !== '' && !diasValidos ? `Use de ${DIAS_MINIMO} a ${DIAS_MAXIMO} dias.` : undefined}
            required
          >
            <Input
              id="acao-dias"
              type="number"
              inputMode="numeric"
              min={DIAS_MINIMO}
              max={DIAS_MAXIMO}
              value={dias}
              invalid={dias !== '' && !diasValidos}
              onChange={(event) => setDias(event.target.value)}
            />
          </Field>
        ) : null}

        {campoValor ? (
          <Field
            id="acao-valor"
            label="Valor mensal (R$)"
            hint="Valor combinado com o negócio. Ex.: 450,00."
            error={valor !== '' && !valorValido ? 'Use um valor de R$ 1,00 a R$ 99.999,00.' : undefined}
            required
          >
            <Input
              id="acao-valor"
              inputMode="decimal"
              value={valor}
              invalid={valor !== '' && !valorValido}
              onChange={(event) => setValor(event.target.value)}
            />
          </Field>
        ) : null}

        <Field id="acao-motivo" label="Motivo" hint="Fica registrado na auditoria. Mínimo de 3 caracteres." required>
          <Textarea
            id="acao-motivo"
            value={motivo}
            maxLength={MOTIVO_MAXIMO}
            rows={4}
            placeholder="Descreva o motivo da ação"
            onChange={(event) => setMotivo(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
