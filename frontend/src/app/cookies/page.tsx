import Link from 'next/link';
import { PublicNavbar } from '@/components/marketing/PublicNavbar';
import { PublicFooter } from '@/components/marketing/PublicFooter';
import { ForcedLight } from '@/components/theme/ForcedLight';
import { EscolhaAtualCookies } from '@/components/cookies/EscolhaAtualCookies';

export const metadata = {
  title: 'Política de Cookies - EasyAgenda+',
  description: 'Quais cookies o EasyAgenda+ usa, para que servem e como você pode escolher o que permitir.',
};

const LAST_UPDATE = '16 de novembro de 2026';

const cookies = [
  { nome: 'access_token', categoria: 'Necessário', finalidade: 'Mantém a sua sessão autenticada.', duracao: '15 minutos' },
  { nome: 'refresh_token', categoria: 'Necessário', finalidade: 'Renova a sessão sem pedir a senha de novo.', duracao: '30 dias' },
  { nome: 'easyagenda-theme', categoria: 'Necessário', finalidade: 'Lembra a sua preferência de tema no painel.', duracao: 'Até ser apagado' },
  { nome: 'cookie_consent', categoria: 'Necessário', finalidade: 'Guarda a sua escolha sobre cookies.', duracao: '12 meses' },
  { nome: '_fbp', categoria: 'Marketing', finalidade: 'Pixel da Meta: identifica o navegador para medir anúncios no Facebook e Instagram.', duracao: '90 dias' },
  { nome: '_fbc', categoria: 'Marketing', finalidade: 'Pixel da Meta: guarda o clique em um anúncio (parâmetro fbclid da URL) para medir conversões.', duracao: '90 dias' },
  { nome: 'fr', categoria: 'Marketing', finalidade: 'Pixel da Meta (domínio da Meta): entrega e mede a relevância dos anúncios.', duracao: '90 dias' },
];

export default function CookiesPage() {
  return (
    <ForcedLight className="min-h-screen bg-bg text-ink">
      <PublicNavbar />

      <main id="main-content" className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-text">Documentos legais</p>
        <h1 className="mt-3 text-3xl font-black sm:text-4xl">Política de Cookies</h1>
        <p className="mt-3 text-sm text-muted">Última atualização: {LAST_UPDATE}</p>

        <div className="mt-10 space-y-10 text-muted">
          <section>
            <h2 className="text-xl font-bold text-ink">1. O que são cookies</h2>
            <p className="mt-3 leading-relaxed">
              Cookies são pequenos arquivos guardados no seu navegador quando você visita um site. Eles ajudam o site a
              lembrar de você e a funcionar corretamente. Usamos também o armazenamento local do navegador, que serve ao
              mesmo propósito e segue as mesmas regras desta política.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-ink">2. Categorias que usamos</h2>
            <p className="mt-3 leading-relaxed">
              <strong className="text-ink">Necessários (sempre ativos).</strong> Mantêm você logado, guardam o tema e a
              sua escolha sobre cookies. Sem eles o site não funciona, por isso não dependem de consentimento.
            </p>
            <p className="mt-3 leading-relaxed">
              <strong className="text-ink">Marketing (só com o seu aceite).</strong> O pixel da Meta mede e melhora os
              nossos anúncios no Facebook e Instagram. Ele só roda nas páginas públicas (nunca dentro do painel), só
              depois que você aceita, e nossos eventos não incluem nome, e-mail, CPF/CNPJ nem telefone. A Meta pode, porém, coletar por conta própria dados técnicos do navegador e o identificador do clique em anúncios (parâmetro fbclid da URL). Ao revogar, o pixel é desativado e o cookie _fbp é apagado.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-ink">3. Lista de cookies</h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2.5">Nome</th>
                    <th className="px-3 py-2.5">Categoria</th>
                    <th className="px-3 py-2.5">Finalidade</th>
                    <th className="px-3 py-2.5">Duração</th>
                  </tr>
                </thead>
                <tbody>
                  {cookies.map((cookie) => (
                    <tr key={cookie.nome} className="border-t border-line align-top">
                      <td className="px-3 py-2.5 font-mono text-ink">{cookie.nome}</td>
                      <td className="px-3 py-2.5">{cookie.categoria}</td>
                      <td className="px-3 py-2.5">{cookie.finalidade}</td>
                      <td className="px-3 py-2.5">{cookie.duracao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-ink">4. Como mudar sua escolha</h2>
            <p className="mt-3 leading-relaxed">
              Você pode aceitar, recusar ou revogar os cookies de Marketing a qualquer momento pelo botão abaixo, pelo
              link &quot;Gerenciar cookies&quot; no rodapé do site ou pelas configurações do seu navegador. Recusar os
              cookies de Marketing não afeta o uso da plataforma.
            </p>
            <EscolhaAtualCookies />
          </section>

          <section>
            <h2 className="text-xl font-bold text-ink">5. Contato</h2>
            <p className="mt-3 leading-relaxed">
              Dúvidas sobre cookies ou sobre os seus dados: contato@easyconnectcg.com.br.
            </p>
          </section>
        </div>

        <div className="mt-12 border-t border-line pt-6 text-sm text-muted">
          Consulte também a nossa{' '}
          <Link href="/privacidade" className="font-semibold text-brand-text hover:underline">Política de Privacidade</Link>{' '}
          e os{' '}
          <Link href="/termos" className="font-semibold text-brand-text hover:underline">Termos de Uso</Link>.
        </div>
      </main>

      <PublicFooter />
    </ForcedLight>
  );
}
