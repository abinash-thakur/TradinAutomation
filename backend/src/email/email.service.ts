import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * Thin SMTP wrapper (nodemailer) used for two things:
 *  1. Login OTP delivery (auth module).
 *  2. Trade notifications - order placed / square off (strategy engine).
 *
 * Deliberately non-fatal: if SMTP isn't configured or a send fails, this logs a warning and
 * resolves `false` rather than throwing. OTP login explicitly checks the return value (a login
 * flow must know whether the OTP actually went out); trade notifications are fire-and-forget by
 * design so a flaky mail server can never block or fail an order.
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
    this.notifyToAddress = this.config.get<string>('NOTIFY_EMAIL') || user || '';

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
    this.logger.log(`Email transport ready via ${host}:${port} (from ${this.fromAddress})`);
  }

  isConfigured(): boolean {
    return !!this.transporter;
  }

  getNotifyAddress(): string {
    return this.notifyToAddress;
  }

  private async send(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(`Email not sent (SMTP not configured): "${subject}" -> ${to}`);
      return false;
    }
    try {
      await this.transporter.sendMail({ from: this.fromAddress, to, subject, html });
      return true;
    } catch (err: any) {
      this.logger.error(`Failed to send email "${subject}" to ${to}: ${err.message}`);
      return false;
    }
  }

  async sendOtpEmail(to: string, otp: string, expiresInMinutes: number): Promise<boolean> {
    const html = `
      <div style="font-family:sans-serif;max-width:420px;margin:0 auto">
        <h2 style="color:#0c0e12">TradePulse AI - Login Code</h2>
        <p style="color:#444">Enter this code to finish signing in. It expires in ${expiresInMinutes} minutes.</p>
        <div style="font-size:32px;font-weight:700;letter-spacing:8px;background:#13161b;color:#9de600;padding:16px 24px;border-radius:8px;text-align:center;margin:16px 0">${otp}</div>
        <p style="color:#888;font-size:12px">If you didn't request this, someone else has your admin password - change it in the backend .env.</p>
      </div>`;
    return this.send(to, `${otp} is your TradePulse AI login code`, html);
  }

  async notifyOrderPlaced(details: {
    strategyName: string;
    symbol: string;
    action: string;
    price: number;
    quantity: number;
    info?: string;
  }): Promise<void> {
    if (!this.notifyToAddress) return;
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#0c0e12">Order Placed - ${details.strategyName}</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="color:#888;padding:4px 0">Action</td><td style="font-weight:600">${details.action}</td></tr>
          <tr><td style="color:#888;padding:4px 0">Symbol</td><td style="font-weight:600">${details.symbol}</td></tr>
          <tr><td style="color:#888;padding:4px 0">Quantity</td><td>${details.quantity}</td></tr>
          <tr><td style="color:#888;padding:4px 0">Price</td><td>$${details.price.toFixed(2)}</td></tr>
        </table>
        ${details.info ? `<p style="color:#444;font-size:13px;margin-top:12px">${details.info}</p>` : ''}
      </div>`;
    void this.send(this.notifyToAddress, `Order Placed: ${details.action} ${details.symbol}`, html);
  }

  async notifySquareOff(details: {
    strategyName: string;
    symbol: string;
    reason: string;
    legs: Array<{ symbol: string; price: number; quantity: number }>;
  }): Promise<void> {
    if (!this.notifyToAddress) return;
    const rows = details.legs
      .map(
        (l) =>
          `<tr><td style="color:#888;padding:4px 0">${l.symbol}</td><td>${l.quantity} @ $${l.price.toFixed(2)}</td></tr>`,
      )
      .join('');
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#d92d20">Position Squared Off - ${details.strategyName}</h2>
        <p style="color:#444;font-size:14px">${details.reason}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px">${rows}</table>
      </div>`;
    void this.send(this.notifyToAddress, `Squared Off: ${details.strategyName} (${details.symbol})`, html);
  }
}
