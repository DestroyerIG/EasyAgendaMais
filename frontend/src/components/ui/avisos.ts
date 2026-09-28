// Aviso padrão para ações ainda sem efeito real — mesma linguagem das telas "em
// breve" do produto (EmBreve.tsx), só que como toast em vez de página inteira,
// já que o botão continua clicável dentro da tela.
//
// Mora no kit porque tem vários consumidores em pastas diferentes (Hoje, Clientes, Agenda,
// Caixa, Plano — a lista muda conforme telas ganham ou perdem botões sem função real, então
// não vale gravar um número fixo aqui).
export const AVISO_RECURSO_A_CAMINHO = 'Esta ação ainda não está disponível — chega em breve.';
