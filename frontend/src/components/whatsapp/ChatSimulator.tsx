'use client';

import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { MessageSquare, Send, Terminal } from 'lucide-react';
import { Card, Button, IconButton, Input, EmptyState } from '@/components/ui';
import { cn } from '@/lib/cn';

interface BotMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: Date;
}

interface ChatSimulatorProps {
  onSendMessage: (text: string) => Promise<string | null>;
}

export const ChatSimulator = ({ onSendMessage }: ChatSimulatorProps) => {
  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const userMsg: BotMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: inputText,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    const botResponse = await onSendMessage(inputText);
    if (botResponse) {
      setMessages(prev => [
        ...prev,
        { id: (Date.now() + 1).toString(), sender: 'bot', text: botResponse, timestamp: new Date() },
      ]);
    }
    setLoading(false);
  };

  return (
    <Card className="flex h-[600px] flex-col overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-line bg-surface-2 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-whatsapp/12 text-whatsapp">
            <MessageSquare className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-[15px] font-bold text-ink">Teste o Bot</h3>
            <p className="text-[13px] font-bold uppercase tracking-tight text-success">Assistente virtual online</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setMessages([])}>
          Limpar Conversa
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {messages.length === 0 && (
          <EmptyState
            icon={Terminal}
            title="Simulador de WhatsApp"
            description='Mande um "Oi" para começar o agendamento.'
          />
        )}
        {messages.map(msg => (
          <div key={msg.id} className={cn('flex', msg.sender === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[80%] rounded-2xl p-4 text-[15px]',
                msg.sender === 'user'
                  ? 'rounded-tr-none bg-surface-2 text-ink'
                  : 'rounded-tl-none bg-whatsapp/12 text-ink',
              )}
            >
              <p className="whitespace-pre-wrap">{msg.text}</p>
              <p className="mt-2 text-[13px] text-muted">
                {format(msg.timestamp, 'HH:mm')}
              </p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-tl-none bg-whatsapp/12 p-4">
              <div className="flex gap-1">
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" />
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:0.2s]" />
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-line bg-surface-2 p-4">
        <div className="flex gap-2">
          <Input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="Envie uma mensagem..."
            className="flex-1"
          />
          <IconButton icon={Send} label="Enviar mensagem" variant="secondary" type="submit" />
        </div>
      </form>
    </Card>
  );
};
