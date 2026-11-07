'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Icon, Modal } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useVocabulario } from '@/hooks/useVocabulario';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { listarTextos, salvarTextos, textosGerais, type TextoDto } from '@/lib/roboTextos';
import { MenuOptionsPanel, type MenuOptionsPanelProps } from './MenuOptionsPanel';
import { ChatSimulator, type BotMessage } from './ChatSimulator';
import { MensagensGerais } from './robo/MensagensGerais';
import { useRascunhoTextos } from './robo/useRascunhoTextos';

const MEDIA_COMPUTADOR = '(min-width: 1024px)';

function useLarguraDeComputador(): boolean {
  const [computador, setComputador] = useState(false);
  useEffect(() => {
    const consulta = window.matchMedia(MEDIA_COMPUTADOR);
    const aplicar = () => setComputador(consulta.matches);
    aplicar();
    consulta.addEventListener?.('change', aplicar);
    return () => consulta.removeEventListener?.('change', aplicar);
  }, []);
  return computador;
}

export interface RoboAtendimentoProps extends Omit<MenuOptionsPanelProps, 'textos' | 'onSalvarTextos'> {
  onSendMessage: (text: string) => Promise<string[]>;
  onLimpar: () => Promise<void>;
  /** Textos gravados: o menu pode ter mudado (a Promoção escrita faz a opção aparecer). */
  onTextosSalvos?: () => void;
}

/** Seção "Robô de atendimento" da aba Conexão: menu e mensagens de um lado, simulador ao lado (ou no botão Testar). */
export function RoboAtendimento({ onSendMessage, onLimpar, onTextosSalvos, ...menu }: RoboAtendimentoProps) {
  const { adaptar } = useVocabulario();
  const { showToast } = useToast();
  const computador = useLarguraDeComputador();
  const [textos, setTextos] = useState<TextoDto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  // A conversa fica aqui: o Testar desmonta o simulador ao fechar, mas a sessão no servidor continua.
  const [conversa, setConversa] = useState<BotMessage[]>([]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(false);
    try {
      setTextos(await listarTextos());
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const gerais = useMemo(() => textosGerais(textos), [textos]);
  const rascunhoGeral = useRascunhoTextos(gerais);

  /** Grava só o que mudou. Devolve false quando não salvou, para a tela manter o que foi digitado. */
  const gravar = useCallback(async (alteracoes: Record<string, string | null>): Promise<boolean> => {
    setSalvando(true);
    try {
      setTextos(await salvarTextos(alteracoes));
      showToast('Mensagens salvas', 'success');
      onTextosSalvos?.();
      return true;
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível salvar as mensagens'), 'error');
      return false;
    } finally {
      setSalvando(false);
    }
  }, [showToast, onTextosSalvos]);

  const salvarGerais = async () => {
    if (await gravar(rascunhoGeral.alteracoes)) rascunhoGeral.descartar();
  };

  const simulador = (
    <ChatSimulator onSendMessage={onSendMessage} onLimpar={onLimpar} temAlteracoes={rascunhoGeral.temAlteracoes} messages={conversa} setMessages={setConversa} />
  );

  return (
    <section aria-labelledby="robo-atendimento-titulo" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="robo-atendimento-titulo" className="text-[20px] font-bold leading-7 text-ink">Robô de atendimento</h2>
          <p className="text-[14px] leading-5 text-muted">{adaptar('Menu, mensagens e simulador do robô que responde às clientes no WhatsApp.')}</p>
        </div>
        {!computador && (
          <Button variant="secondary" onClick={() => setTestando(true)}>
            <Icon name="smart_toy" size={16} />
            Testar
          </Button>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <MenuOptionsPanel {...menu} textos={textos} onSalvarTextos={gravar} />
          <MensagensGerais
            textos={gerais}
            rascunho={rascunhoGeral}
            loading={carregando}
            erro={erro}
            salvando={salvando}
            onSalvar={() => void salvarGerais()}
            onRecarregar={() => void carregar()}
          />
        </div>
        {computador && <div className="sticky top-4">{simulador}</div>}
      </div>

      {!computador && (
        <Modal isOpen={testando} onClose={() => setTestando(false)} title="Testar o robô" icon="smart_toy" size="md">
          {simulador}
        </Modal>
      )}
    </section>
  );
}
