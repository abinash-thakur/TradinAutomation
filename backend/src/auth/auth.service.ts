import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { EmailService } from '../email/email.service';

interface PendingOtpSession {
  username: string;
  otp: string;
  expiresAt: number;
  attemptsLeft: number;
}

const OTP_TTL_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  /**
   * Pending OTP sessions, in-memory only (not Redis - RedisService silently no-ops when the
   * remote server is unreachable, which would make OTPs disappear without warning; an in-memory
   * Map fails loudly instead by simply not having the session). This means a backend restart
   * invalidates any login in progress - acceptable for a single-operator tool, not for a
   * multi-instance deployment.
   */
  private readonly pendingSessions = new Map<string, PendingOtpSession>();

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
  ) {}

  /**
   * Step 1 of login: verify username/password, then email a 6-digit OTP and hand back an opaque
   * loginToken identifying this pending session. No JWT is issued here.
   */
  async login(username: string, password: string): Promise<{ loginToken: string; expiresInSeconds: number; sentTo: string }> {
    const expectedUsername = this.config.get<string>('ADMIN_USERNAME', 'admin');
    const expectedPassword = this.config.get<string>('ADMIN_PASSWORD', '');

    if (!expectedPassword) {
      throw new UnauthorizedException('Admin login is not configured. Set ADMIN_PASSWORD in the backend .env.');
    }
    if (!this.timingSafeEqual(username || '', expectedUsername) || !this.timingSafeEqual(password || '', expectedPassword)) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const notifyTo = this.email.getNotifyAddress();
    if (!this.email.isConfigured() || !notifyTo) {
      throw new UnauthorizedException(
        'Password correct, but OTP email cannot be sent: SMTP is not configured. Set SMTP_HOST/SMTP_USER/SMTP_PASS/NOTIFY_EMAIL in the backend .env.',
      );
    }

    const otp = this.generateOtp();
    const loginToken = crypto.randomBytes(24).toString('hex');
    this.pendingSessions.set(loginToken, {
      username: expectedUsername,
      otp,
      expiresAt: Date.now() + OTP_TTL_MINUTES * 60 * 1000,
      attemptsLeft: MAX_OTP_ATTEMPTS,
    });
    this.pruneExpiredSessions();

    const sent = await this.email.sendOtpEmail(notifyTo, otp, OTP_TTL_MINUTES);
    if (!sent) {
      this.pendingSessions.delete(loginToken);
      throw new UnauthorizedException('Failed to send OTP email. Check backend SMTP settings and try again.');
    }

    return { loginToken, expiresInSeconds: OTP_TTL_MINUTES * 60, sentTo: this.maskEmail(notifyTo) };
  }

  /**
   * Step 2 of login: consume the OTP for a pending session and issue the real JWT.
   */
  async verifyOtp(loginToken: string, otp: string): Promise<{ accessToken: string; username: string }> {
    const session = this.pendingSessions.get(loginToken || '');
    if (!session) {
      throw new UnauthorizedException('Login session not found or already used. Please log in again.');
    }
    if (Date.now() > session.expiresAt) {
      this.pendingSessions.delete(loginToken);
      throw new UnauthorizedException('OTP has expired. Please log in again.');
    }
    if (session.attemptsLeft <= 0) {
      this.pendingSessions.delete(loginToken);
      throw new UnauthorizedException('Too many incorrect attempts. Please log in again.');
    }

    if (!this.timingSafeEqual(otp || '', session.otp)) {
      session.attemptsLeft -= 1;
      if (session.attemptsLeft <= 0) {
        this.pendingSessions.delete(loginToken);
        throw new UnauthorizedException('Too many incorrect attempts. Please log in again.');
      }
      throw new UnauthorizedException(`Incorrect code. ${session.attemptsLeft} attempt(s) left.`);
    }

    this.pendingSessions.delete(loginToken);
    const accessToken = await this.jwt.signAsync({ sub: session.username, username: session.username });
    return { accessToken, username: session.username };
  }

  /**
   * Re-sends a fresh OTP for an existing (not-yet-verified) session, e.g. if the first email
   * lands in spam or the 5-minute window runs out. Re-uses the same loginToken.
   */
  async resendOtp(loginToken: string): Promise<{ expiresInSeconds: number; sentTo: string }> {
    const session = this.pendingSessions.get(loginToken || '');
    if (!session) {
      throw new BadRequestException('Login session not found or already used. Please log in again.');
    }

    const notifyTo = this.email.getNotifyAddress();
    session.otp = this.generateOtp();
    session.expiresAt = Date.now() + OTP_TTL_MINUTES * 60 * 1000;
    session.attemptsLeft = MAX_OTP_ATTEMPTS;

    const sent = await this.email.sendOtpEmail(notifyTo, session.otp, OTP_TTL_MINUTES);
    if (!sent) {
      throw new UnauthorizedException('Failed to send OTP email. Check backend SMTP settings and try again.');
    }
    return { expiresInSeconds: OTP_TTL_MINUTES * 60, sentTo: this.maskEmail(notifyTo) };
  }

  private generateOtp(): string {
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private pruneExpiredSessions() {
    const now = Date.now();
    for (const [token, session] of this.pendingSessions) {
      if (now > session.expiresAt) this.pendingSessions.delete(token);
    }
  }

  private maskEmail(email: string): string {
    const [user, domain] = email.split('@');
    if (!domain) return email;
    const visible = user.slice(0, 2);
    return `${visible}${'*'.repeat(Math.max(1, user.length - 2))}@${domain}`;
  }

  private timingSafeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    const maxLen = Math.max(bufA.length, bufB.length, 1);
    const paddedA = Buffer.concat([bufA], maxLen);
    const paddedB = Buffer.concat([bufB], maxLen);
    return crypto.timingSafeEqual(paddedA, paddedB) && bufA.length === bufB.length;
  }
}
