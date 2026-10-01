'use client';

import { useState, type ReactNode } from 'react';
import { CalendarPlus, CalendarX, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import {
  Avatar,
  Banner,
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  IconButton,
  Input,
  MetricCard,
  Modal,
  ModalFooter,
  PageHeader,
  PasswordInput,
  Select,
  SidePanel,
  Skeleton,
  StatusChip,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  ThemeSelect,
  type AppointmentStatus,
} from '@/components/ui';

const STATUSES: AppointmentStatus[] = ['confirmado', 'aguardando', 'aguardando_pagamento', 'em_atendimento', 'concluido', 'faltou', 'cancelado'];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function UiGallery() {
  const [switchOn, setSwitchOn] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="app-theme min-h-screen">
      <main id="main-content" className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8">
        <PageHeader title="Galeria do kit" description="Componentes do design system EasyAgenda+ nos dois temas." />

        <Section title="Tema">
          <ThemeSelect />
        </Section>

        <Section title="Botões">
          <div className="flex flex-wrap gap-3">
            <Button>Salvar</Button>
            <Button variant="secondary">Cancelar</Button>
            <Button variant="ghost">Ver detalhes</Button>
            <Button variant="danger">Excluir</Button>
            <Button variant="whatsapp">Conectar WhatsApp</Button>
            <Button loading>Salvando</Button>
            <Button size="sm">Pequeno</Button>
            <Button size="lg">Grande</Button>
            <IconButton icon={Pencil} label="Editar" />
            <IconButton icon={Trash2} label="Excluir" variant="secondary" />
          </div>
        </Section>

        <Section title="Cartões e métricas">
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard label="Atendimentos hoje" value={12} delta={{ value: '+3 que ontem', trend: 'up' }} />
            <MetricCard label="Faturamento do dia" value="R$ 1.240,00" delta={{ value: '-5%', trend: 'down' }} />
            <MetricCard label="Despesas do mês" value="R$ 380,00" delta={{ value: '-12%', trend: 'down', tone: 'positive' }} />
          </div>
          <Card>
            <p className="text-[15px] text-ink">Cartão simples com borda de 1px e raio de 16px.</p>
          </Card>
        </Section>

        <Section title="Status">
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((status) => (
              <StatusChip key={status} status={status} />
            ))}
          </div>
        </Section>

        <Section title="Avatares">
          <div className="flex items-center gap-3">
            <Avatar name="Mariana Souza" />
            <Avatar name="Paula Lima" size={40} />
            <Avatar name="Rafa" />
          </div>
        </Section>

        <Section title="Avisos">
          <div className="overflow-hidden rounded-card border border-line">
            <Banner tone="info">Informação para o negócio.</Banner>
            <Banner tone="warning">Faltam 3 dias no período gratuito.</Banner>
            <Banner tone="danger">Pagamento recusado.</Banner>
            <Banner tone="success">WhatsApp conectado.</Banner>
          </div>
        </Section>

        <Section title="Formulário">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="g-nome" label="Nome do negócio" hint="Aparece para as clientes">
              <Input id="g-nome" defaultValue="Studio Aurora" aria-describedby="g-nome-hint" />
            </Field>
            <Field id="g-email" label="E-mail" error="E-mail inválido">
              <Input id="g-email" invalid defaultValue="studio@" aria-describedby="g-email-error" />
            </Field>
            <Field id="g-intervalo" label="Intervalo da agenda">
              <Select id="g-intervalo" defaultValue="30">
                <option value="15">15 minutos</option>
                <option value="30">30 minutos</option>
              </Select>
            </Field>
            <Field id="g-senha" label="Senha">
              <PasswordInput id="g-senha" defaultValue="segredo123" />
            </Field>
            <Field id="g-obs" label="Observações" className="sm:col-span-2">
              <Textarea id="g-obs" placeholder="Preferências da cliente" />
            </Field>
            <div className="sm:col-span-2">
              <Switch checked={switchOn} onCheckedChange={setSwitchOn} label="Enviar lembretes por WhatsApp" description="Duas horas antes do horário." />
            </div>
          </div>
        </Section>

        <Section title="Tabela">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Cliente</TableHeaderCell>
                <TableHeaderCell>Último atendimento</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>Mariana Souza</TableCell>
                <TableCell className="tabular-nums">12/09/2026</TableCell>
                <TableCell><StatusChip status="concluido" /></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Paula Lima</TableCell>
                <TableCell className="tabular-nums">17/09/2026</TableCell>
                <TableCell><StatusChip status="confirmado" /></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Section>

        <Section title="Abas">
          <Tabs defaultValue="mensagens">
            <TabsList aria-label="Seções do WhatsApp">
              <TabsTrigger value="mensagens">Mensagens</TabsTrigger>
              <TabsTrigger value="menu">Menu do bot</TabsTrigger>
            </TabsList>
            <TabsContent value="mensagens">Conteúdo de mensagens.</TabsContent>
            <TabsContent value="menu">Conteúdo do menu.</TabsContent>
          </Tabs>
        </Section>

        <Section title="Menu">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton icon={MoreHorizontal} label="Ações" variant="secondary" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem>Editar</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive>Excluir</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Section>

        <Section title="Camadas">
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => setModalOpen(true)}>Abrir modal</Button>
            <Button variant="secondary" onClick={() => setPanelOpen(true)}>Abrir painel lateral</Button>
            <Button variant="secondary" onClick={() => setSheetOpen(true)}>Abrir folha inferior</Button>
          </div>
          <Modal
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Novo agendamento"
            icon={CalendarPlus}
            footer={<ModalFooter onCancel={() => setModalOpen(false)} onSubmit={() => setModalOpen(false)} submitLabel="Agendar" />}
          >
            <p className="text-[15px] text-muted">Conteúdo do modal.</p>
          </Modal>
          <SidePanel open={panelOpen} onOpenChange={setPanelOpen} title="Ficha da cliente">
            <p className="text-[15px] text-muted">Conteúdo do painel lateral.</p>
          </SidePanel>
          <SidePanel open={sheetOpen} onOpenChange={setSheetOpen} title="Mais" side="bottom">
            <p className="text-[15px] text-muted">Conteúdo da folha inferior.</p>
          </SidePanel>
        </Section>

        <Section title="Estado vazio e carregamento">
          <Card>
            <EmptyState icon={CalendarX} title="Nenhum agendamento hoje" description="Os horários marcados aparecem aqui." action={{ label: 'Novo agendamento', onClick: () => undefined }} />
          </Card>
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </Section>
      </main>
    </div>
  );
}
