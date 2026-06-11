import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { MetricsService } from '../metrics/metrics.service';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

export interface EmailContent {
  subject: string;
  html: string;
}

const BRAND_COLOR = '#16a34a';

/** Branded minimal HTML wrapper for all transactional emails. */
export function emailLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f6f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f5;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background-color:${BRAND_COLOR};padding:20px 32px;">
          <span style="color:#ffffff;font-size:18px;font-weight:bold;">Smart Grocery AI</span>
          <span style="color:#dcfce7;font-size:12px;margin-left:8px;">Singapore</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">${title}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#6b7280;">
            Smart Grocery AI Singapore — smarter groceries, lower bills.<br>
            If you did not expect this email, you can safely ignore it.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function ctaButton(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="border-radius:6px;background-color:${BRAND_COLOR};">
    <a href="${url}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">${label}</a>
  </td></tr></table>
  <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">Or paste this link into your browser:<br><a href="${url}" style="color:${BRAND_COLOR};word-break:break-all;">${url}</a></p>`;
}

export function verificationEmail(link: string): EmailContent {
  return {
    subject: 'Verify your email — Smart Grocery AI',
    html: emailLayout(
      'Verify your email address',
      `<p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.6;">
        Welcome to Smart Grocery AI! Confirm your email address to activate your account.
        This link expires in 24 hours.
      </p>
      ${ctaButton(link, 'Verify email')}`,
    ),
  };
}

export function passwordResetEmail(link: string): EmailContent {
  return {
    subject: 'Reset your password — Smart Grocery AI',
    html: emailLayout(
      'Reset your password',
      `<p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.6;">
        We received a request to reset the password for your Smart Grocery AI account.
        This link expires in 1 hour. If you did not request this, no action is needed.
      </p>
      ${ctaButton(link, 'Reset password')}`,
    ),
  };
}

export function alertEmail(title: string, body: string, ctaUrl?: string): EmailContent {
  return {
    subject: `${title} — Smart Grocery AI`,
    html: emailLayout(
      title,
      `<p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.6;">${body}</p>
      ${ctaUrl ? ctaButton(ctaUrl, 'View details') : ''}`,
    ),
  };
}

const MAX_SEND_ATTEMPTS = 3;
const SEND_BACKOFF_BASE_MS = 500;

/**
 * SMTP mail sender (Mailhog-friendly: omits auth when SMTP_USER is empty).
 * `send` retries with backoff and NEVER throws — failures are logged and
 * recorded under the `sg_mail_failures_total` metric.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly metrics: MetricsService,
  ) {
    const host = configService.get<string>('smtp.host', 'localhost');
    const port = configService.get<number>('smtp.port', 1025);
    const user = configService.get<string | undefined>('smtp.user');
    const pass = configService.get<string | undefined>('smtp.pass');
    this.from = configService.get<string>('smtp.from', 'Smart Grocery AI <no-reply@smartgrocery.sg>');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      ...(user ? { auth: { user, pass: pass ?? '' } } : {}),
    });
    this.logger.log(`SMTP transport configured for ${host}:${port}${user ? ' (authenticated)' : ' (no auth)'}`);
  }

  async send(opts: SendMailOptions): Promise<void> {
    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
      try {
        await this.transporter.sendMail({
          from: this.from,
          to: opts.to,
          subject: opts.subject,
          html: opts.html,
        });
        this.metrics.increment('mail_sent_total');
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (attempt === MAX_SEND_ATTEMPTS) {
          this.logger.error(
            `Failed to send email "${opts.subject}" to ${opts.to} after ${MAX_SEND_ATTEMPTS} attempts: ${message}`,
          );
          this.metrics.increment('mail_failures_total');
          return;
        }
        const backoffMs = SEND_BACKOFF_BASE_MS * 2 ** (attempt - 1);
        this.logger.warn(
          `Email send attempt ${attempt}/${MAX_SEND_ATTEMPTS} to ${opts.to} failed (${message}); retrying in ${backoffMs}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }
}
