import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * Human-readable label for each order-placed action code. Used in both the subject line and
 * body so the email reads like a normal notification ("ETHUSD future buy filled") rather than a
 * raw enum dump ("BUY_FUTURE_ENTRY") - spam filters (and people) weight machine-generated-looking
 * text more heavily than natural sentences.
 */
const ACTION_LABELS: Record<string, string> = {
  BUY_FUTURE_ENTRY: 'future buy order filled',
  SELL_CALL_ENTRY: 'call sell order filled',
  BUY_FUTURE_AVERAGING: 'future averaging order filled',
  SELL_CALL_BEST_PREMIUM: 'call sell order filled',
};

/**
 * Thin SMTP wrapper (nodemailer) used for two things:
 *  1. Login OTP delivery (auth module).
 *  2. Trade notifications - order placed / square off (strategy engine).
 *
 * Deliberately non-fatal: if SMTP isn't configured or a send fails, this logs a warning and
 * resolves `false` rather than throwing. OTP login explicitly checks the return value (a login
 * flow must know whether the OTP actually went out); trade notifications are fire-and-forget by
 * design so a flaky mail server can never block or fail an order.
 *
 * DELIVERABILITY: every message is sent as a real multipart/alternative email (plain-text
 * alternative alongside the HTML), with a matching Reply-To and a natural, sentence-style
 * subject/body - the combination spam filters weight most heavily for a personal SMTP relay like
 * Gmail. None of this can override a sender already marked as spam for a given recipient by hand;
 * see the note in sendOtpEmail()'s caller / the chat reply for the one manual step that fixes that.
 */
@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private fromAddress = '';
  private notifyToAddress = '';

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    this.fromAddress = this.config.get<string>('SMTP_FROM') || user || '';
    this.notifyToAddress =
      this.config.get<string>('NOTIFY_EMAIL') || user || '';

    if (!host || !user || !pass) {
      this.logger.warn(
        'SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing). OTP login and trade emails are disabled until backend/.env is filled in.',
      );
      return;
    }

    const port = Number(this.config.get<number>('SMTP_PORT') || 587);
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: this.config.get<string>('SMTP_SECURE') === 'true' || port === 465,
      auth: { user, pass },
    });
    this.logger.log(
      `Email transport ready via ${host}:${port} (from ${this.fromAddress})`,
    );
  }

  isConfigured(): boolean {
    return !!this.transporter;
  }

  getNotifyAddress(): string {
    return this.notifyToAddress;
  }

  /**
   * Sends a proper multipart/alternative message (text + html). A missing plain-text part is one
   * of the most common, well-documented spam signals for personal/transactional mail - almost
   * every legitimate sender includes one, almost no bulk/marketing sender bothers to.
   */
  private async send(
    to: string,
    subject: string,
    html: string,
    text: string,
  ): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(
        `Email not sent (SMTP not configured): "${subject}" -> ${to}`,
      );
      return false;
    }
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        replyTo: this.fromAddress,
        subject,
        text,
        html,
      });
      return true;
    } catch (err: any) {
      this.logger.error(
        `Failed to send email "${subject}" to ${to}: ${err.message}`,
      );
      return false;
    }
  }

  /** Shared, deliberately plain wrapper - no banner/color blocks, reads like a personal note. */
  private wrap(bodyHtml: string): string {
    return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a;font-size:14px;line-height:1.6">${bodyHtml}<p style="color:#8a8a8a;font-size:12px;margin-top:24px;padding-top:12px;border-top:1px solid #e5e5e5">Sent by TradePulse, your algorithmic trading engine.</p></div>`;
  }

  async sendOtpEmail(
    to: string,
    otp: string,
    expiresInMinutes: number,
  ): Promise<boolean> {
    const html = this.wrap(`
      <p>Hi,</p>
      <p>Here is your sign-in code for TradePulse. It expires in ${expiresInMinutes} minutes.</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:20px 0">${otp}</p>
      <p style="color:#666;font-size:13px">If you didn't request this, someone else has your admin password - change it in the backend configuration.</p>`);
    const text = `Hi,\n\nYour TradePulse sign-in code is: ${otp}\n\nIt expires in ${expiresInMinutes} minutes.\n\nIf you didn't request this, someone else has your admin password - change it in the backend configuration.\n\n- TradePulse`;
    return this.send(to, `Your TradePulse sign-in code is ${otp}`, html, text);
  }

  notifyOrderPlaced(details: {
    strategyName: string;
    symbol: string;
    action: string;
    price: number;
    quantity: number;
    info?: string;
  }): void {
    if (!this.notifyToAddress) return;
    const label = ACTION_LABELS[details.action] || 'order filled';
    const qtyWord = details.quantity === 1 ? 'contract' : 'contracts';

    const html = this.wrap(`
      <p>Hi,</p>
      <p>Your <strong>${details.symbol}</strong> ${label} on strategy <strong>${details.strategyName}</strong>.</p>
      <p>${details.quantity} ${qtyWord} at $${details.price.toFixed(2)}.</p>
      ${details.info ? `<p style="color:#555">${details.info}</p>` : ''}`);
    const text = `Hi,\n\nYour ${details.symbol} ${label} on strategy ${details.strategyName}.\n${details.quantity} ${qtyWord} at $${details.price.toFixed(2)}.\n${details.info ? `\n${details.info}\n` : ''}\n- TradePulse`;

    void this.send(
      this.notifyToAddress,
      `${details.symbol}: ${label}`,
      html,
      text,
    );
  }

  notifySquareOff(details: {
    strategyName: string;
    symbol: string;
    reason: string;
    legs: Array<{ symbol: string; price: number; quantity: number }>;
  }): void {
    if (!this.notifyToAddress) return;
    const legLines = details.legs.map(
      (l) => `${l.symbol}: ${l.quantity} @ $${l.price.toFixed(2)}`,
    );

    const html = this.wrap(`
      <p>Hi,</p>
      <p>All positions on <strong>${details.strategyName}</strong> (${details.symbol}) were just closed.</p>
      <p style="color:#555">${details.reason}</p>
      <ul style="padding-left:18px;margin:12px 0">
        ${legLines.map((l) => `<li>${l}</li>`).join('')}
      </ul>`);
    const text = `Hi,\n\nAll positions on ${details.strategyName} (${details.symbol}) were just closed.\n${details.reason}\n\n${legLines.join('\n')}\n\n- TradePulse`;

    void this.send(
      this.notifyToAddress,
      `${details.symbol}: positions closed`,
      html,
      text,
    );
  }
}
