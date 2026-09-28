# Seguimento do design system

O que ficou em aberto depois do sub-projeto B (design system e estrutura do painel). Nada aqui impede o uso do sistema; são decisões suas e melhorias pequenas.

## Decisões que dependem de você

1. **Uma passada de revisão nos textos dos botões.** Hoje convivem dois estilos: "Novo Agendamento", "Novo Cliente", "Nova Opção", "GERAR RELATÓRIO" de um lado, e "Salvar preferências", "Atualizar senha", "Ver planos" do outro. A regra do projeto é frase normal, com maiúscula só na primeira palavra. Mudar um texto de cada vez deixa a tela mais desigual, não menos, então isso pede uma passada única com a sua aprovação.
2. **O título aparece duas vezes no celular:** uma na barra de cima e outra no cabeçalho da tela. Foi assim que o plano pediu. Se incomodar, dá para esconder um dos dois.
3. **Verde do WhatsApp com texto branco** fica em 4,36:1 de contraste, um pouco abaixo do mínimo recomendado para texto pequeno. A cor vem do DESIGN.md.

## Melhorias técnicas pequenas

- O Vitest imprime um aviso de configuração a cada execução. Silenciar exige renomear `vitest.config.ts` para `.mts` ou declarar `"type": "module"`.
- Linhas da lista de clientes abrem o painel por clique, sem acesso por teclado. Já era assim antes da migração.
- `formatLastVisit` e `formatDate` repetem a mesma formatação de data em arquivos diferentes.
- As "etiquetas" de status aparecem em cinco receitas de estilo ligeiramente diferentes; um componente `Chip` no kit resolveria.

## O que a migração deixou pronto

- Tokens de cor claros e escuros, com o tema seguindo o aparelho, e `ForcedDark` isolando as telas que continuam escuras de propósito.
- Kit de componentes em `frontend/src/components/ui/`, com galeria em `/dev/ui` (só em desenvolvimento).
- Um teste de conformidade que reprova cor fixa nos arquivos migrados e também reprova arquivo novo que ninguém cadastrou na lista.
- Dois tokens novos, `success-text` e `warning-text`, porque `success` e `warning` não têm contraste suficiente como texto no tema claro.
