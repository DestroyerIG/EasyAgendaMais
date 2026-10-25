import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer/index.js';
import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { maskEmail } from '../utils/mask.js';

let transporter: Mail | null = null;

interface SmtpConfig {
  host: string | undefined;
  port: number;
  user: string | undefined;
  pass: string | undefined;
  from: string | undefined;
  hasAuth: boolean;
  isConfigured: boolean;
}

interface VerificationUrlParams {
  token: string;
  email?: string;
}

interface EmailTemplateParams {
  verificationUrl: string;
  businessName?: string;
  ownerName?: string;
}

interface EmailTemplate {
  html: string;
  text: string;
}

interface SendVerificationEmailParams {
  to: string;
  token: string;
  businessName?: string;
  ownerName?: string;
}

interface EmailDeliveryResult {
  delivered: boolean;
  mode: 'smtp' | 'log';
}

const escaparHtml = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const getFrontendBaseUrl = (): string => {
  const baseUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
  return baseUrl.replace(/\/+$/, '');
};

const getSmtpConfig = (): SmtpConfig => {
  const host = process.env.SMTP_HOST;
  const port = Number.parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  const hasAuth = Boolean(user && pass);
  const isConfigured = Boolean(host && Number.isFinite(port) && from);

  return {
    host,
    port,
    user,
    pass,
    from,
    hasAuth,
    isConfigured,
  };
};

const getTransporter = (): Mail | null => {
  if (transporter) {
    return transporter;
  }

  const config = getSmtpConfig();

  if (!config.isConfigured) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    ...(config.hasAuth
      ? {
          auth: {
            user: config.user,
            pass: config.pass,
          },
        }
      : {}),
  });

  return transporter;
};

const buildVerificationUrl = ({ token, email }: VerificationUrlParams): string => {
  const verifyUrl = new URL('/verificar-email', getFrontendBaseUrl());
  verifyUrl.searchParams.set('token', token);

  if (email) {
    verifyUrl.searchParams.set('email', email);
  }

  return verifyUrl.toString();
};

const buildEmailTemplate = ({ verificationUrl, businessName, ownerName }: EmailTemplateParams): EmailTemplate => {
  const greetingName = ownerName || 'Tudo bem';
  // Sem artigo antes do nome: ele pode ser de qualquer gênero ("o Estúdio Y", "a Esmalteria Z").
  const shopLabel = businessName ? `o cadastro de ${businessName}` : 'seu cadastro';

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px; color: #111827;">Confirme seu e-mail no EasyAgenda+</h2>
      <p style="margin: 0 0 12px;">Olá, ${greetingName}.</p>
      <p style="margin: 0 0 20px;">Recebemos ${shopLabel}. Para ativar sua conta, confirme seu e-mail no botão abaixo:</p>

      <p style="margin: 0 0 24px;">
        <a href="${verificationUrl}" style="display: inline-block; background: #f97316; color: #111827; font-weight: 700; text-decoration: none; padding: 12px 20px; border-radius: 10px;">
          Confirmar e-mail
        </a>
      </p>

      <p style="margin: 0 0 12px; color: #4b5563;">Se o botão não funcionar, copie e cole este link no navegador:</p>
      <p style="margin: 0 0 20px; word-break: break-all;"><a href="${verificationUrl}">${verificationUrl}</a></p>

      <p style="margin: 0; color: #6b7280; font-size: 13px;">Se você não criou esta conta, pode ignorar esta mensagem.</p>
    </div>
  `;

  const text = [
    'Confirme seu e-mail no EasyAgenda+',
    '',
    `Olá, ${greetingName}.`,
    '',
    'Recebemos seu cadastro. Para ativar sua conta, confirme seu e-mail no link abaixo:',
    verificationUrl,
    '',
    'Se você não criou esta conta, pode ignorar esta mensagem.',
  ].join('\n');

  return { html, text };
};

export const emailService = {
  buildVerificationUrl,
  getFrontendBaseUrl,

  async sendAccountVerificationEmail({ to, token, businessName, ownerName }: SendVerificationEmailParams): Promise<EmailDeliveryResult> {
    const verificationUrl = buildVerificationUrl({ token, email: to });
    const config = getSmtpConfig();

    if (!config.isConfigured) {
      if (process.env.NODE_ENV === 'production') {
        throw new AppError(
          'Configuração SMTP incompleta. Verifique as variáveis SMTP_*.',
          503,
          'SMTP_NOT_CONFIGURED'
        );
      }

      logger.warn(
        { email: to },
        'SMTP não configurado em ambiente não produtivo. Link de verificação será apenas logado.'
      );
      logger.info({ email: maskEmail(to), verificationUrl }, 'Link de verificação gerado (modo desenvolvimento)');

      return {
        delivered: false,
        mode: 'log',
      };
    }

    const mailTransport = getTransporter();

    if (!mailTransport) {
      throw new AppError(
        'Transporte SMTP indisponível para envio de e-mail.',
        503,
        'SMTP_UNAVAILABLE'
      );
    }

    const { html, text } = buildEmailTemplate({ verificationUrl, businessName, ownerName });

    try {
      await mailTransport.sendMail({
        from: config.from,
        to,
        subject: 'Confirme seu e-mail no EasyAgenda+',
        html,
        text,
      });

      return {
        delivered: true,
        mode: 'smtp',
      };
    } catch (error) {
      logger.error({ err: error, email: maskEmail(to) }, 'Falha ao enviar e-mail de verificação via SMTP');
      throw new AppError(
        'Não foi possível enviar o e-mail de verificação no momento.',
        502,
        'EMAIL_DELIVERY_FAILED'
      );
    }
  },

  /**
   * Convite da profissional para o app. Nunca lança: a dona também recebe o link para copiar,
   * então um SMTP fora do ar não impede o convite.
   */
  async sendConviteProfissional({ to, url, negocio, nome }: { to: string; url: string; negocio: string; nome: string }): Promise<EmailDeliveryResult> {
    const config = getSmtpConfig();
    const mailTransport = config.isConfigured ? getTransporter() : null;
    if (!mailTransport) {
      logger.warn({ email: maskEmail(to) }, 'SMTP não configurado: convite da profissional não enviado por e-mail');
      return { delivered: false, mode: 'log' };
    }
    const primeiro = escaparHtml(nome.split(' ')[0] || nome);
    const salao = escaparHtml(negocio);
    const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px; color: #111827;">${salao} te convidou para o EasyAgenda+</h2>
      <p style="margin: 0 0 12px;">Olá, ${primeiro}.</p>
      <p style="margin: 0 0 20px;">Com o app você vê sua agenda do dia, a ficha das clientes e seus números, direto no celular. Crie sua senha no botão abaixo:</p>
      <p style="margin: 0 0 24px;">
        <a href="${url}" style="display: inline-block; background: #f97316; color: #111827; font-weight: 700; text-decoration: none; padding: 12px 20px; border-radius: 10px;">
          Criar minha senha
        </a>
      </p>
      <p style="margin: 0 0 12px; color: #4b5563;">Se o botão não funcionar, copie e cole este link no navegador:</p>
      <p style="margin: 0 0 20px; word-break: break-all;"><a href="${url}">${url}</a></p>
      <p style="margin: 0; color: #6b7280; font-size: 13px;">O link vale por 7 dias. Se você não trabalha em ${salao}, pode ignorar esta mensagem.</p>
    </div>
  `;
    const text = [
      `${negocio} te convidou para o EasyAgenda+`, '', `Olá, ${nome.split(' ')[0] || nome}.`, '',
      'Crie sua senha no link abaixo para usar o app da profissional:', url, '', 'O link vale por 7 dias.',
    ].join('\n');
    try {
      await mailTransport.sendMail({ from: config.from, to, subject: `${negocio} te convidou para o EasyAgenda+`, html, text });
      return { delivered: true, mode: 'smtp' };
    } catch (error) {
      logger.error({ err: error, email: maskEmail(to) }, 'Falha ao enviar o convite da profissional');
      return { delivered: false, mode: 'smtp' };
    }
  },
};
