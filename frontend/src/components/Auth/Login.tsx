import React, { useEffect, useRef, useState } from 'react';
import { Lock, Mail, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { api } from '../../services/api';
import { authStore } from '../../services/auth';

interface LoginProps {
  onSuccess: () => void;
}

type Step = 'credentials' | 'otp';

export const Login: React.FC<LoginProps> = ({ onSuccess }) => {
  const [step, setStep] = useState<Step>('credentials');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loginToken, setLoginToken] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  // Separate, much shorter cooldown before "Resend" is clickable again - gating resend on the
  // full ~5 minute OTP expiry would be bad UX if the first email is just slow to arrive.
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const otpInputRef = useRef<HTMLInputElement>(null);

  const RESEND_COOLDOWN_SECONDS = 30;

  // Countdown for OTP validity (informational)
  useEffect(() => {
    if (step !== 'otp' || secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [step, secondsLeft]);

  // Countdown for the resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  useEffect(() => {
    if (step === 'otp') otpInputRef.current?.focus();
  }, [step]);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(username.trim(), password);
      setLoginToken(res.loginToken);
      setSentTo(res.sentTo);
      setSecondsLeft(res.expiresInSeconds);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setOtp('');
      setStep('otp');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { accessToken } = await api.verifyOtp(loginToken, otp.trim());
      authStore.setToken(accessToken);
      onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Incorrect or expired code');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setResending(true);
    try {
      const res = await api.resendOtp(loginToken);
      setSentTo(res.sentTo);
      setSecondsLeft(res.expiresInSeconds);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setOtp('');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not resend code');
    } finally {
      setResending(false);
    }
  };

  const backToCredentials = () => {
    setStep('credentials');
    setError('');
    setOtp('');
  };

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="min-h-screen bg-[#0c0e12] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-brand-subtle flex items-center justify-center mb-4">
            {step === 'credentials' ? <Lock className="w-6 h-6 text-brand" /> : <Mail className="w-6 h-6 text-brand" />}
          </div>
          <h1 className="text-xl font-semibold text-txt-primary">TradePulse AI</h1>
          <p className="text-sm text-txt-muted mt-1">
            {step === 'credentials' ? 'Sign in to continue' : `Enter the code sent to ${sentTo}`}
          </p>
        </div>

        {step === 'credentials' ? (
          <form
            onSubmit={handleCredentialsSubmit}
            className="bg-surface-card border border-surface-border rounded-2xl p-6 space-y-4 shadow-card"
          >
            {error && (
              <div className="flex items-start gap-2 bg-danger-subtle border border-danger/30 text-danger text-sm rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-txt-secondary mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                className="w-full bg-surface-elevated border border-surface-border rounded-lg px-3 py-2 text-sm text-txt-primary focus:outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/40"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-txt-secondary mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                autoFocus
                className="w-full bg-surface-elevated border border-surface-border rounded-lg px-3 py-2 text-sm text-txt-primary focus:outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/40"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-brand hover:bg-brand-hover disabled:opacity-60 disabled:cursor-not-allowed text-[#0c0e12] font-semibold text-sm rounded-lg py-2.5 transition-colors"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Checking…' : 'Continue'}
            </button>
          </form>
        ) : (
          <form
            onSubmit={handleOtpSubmit}
            className="bg-surface-card border border-surface-border rounded-2xl p-6 space-y-4 shadow-card"
          >
            {error && (
              <div className="flex items-start gap-2 bg-danger-subtle border border-danger/30 text-danger text-sm rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-txt-secondary mb-1.5">6-digit code</label>
              <input
                ref={otpInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoComplete="one-time-code"
                required
                className="w-full bg-surface-elevated border border-surface-border rounded-lg px-3 py-2.5 text-center text-2xl tracking-[0.5em] font-mono text-txt-primary focus:outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/40"
              />
              <p className="text-[11px] text-txt-dim mt-1.5">
                {secondsLeft > 0 ? `Code expires in ${minutes}:${seconds}` : 'Code has expired - request a new one'}
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full flex items-center justify-center gap-2 bg-brand hover:bg-brand-hover disabled:opacity-60 disabled:cursor-not-allowed text-[#0c0e12] font-semibold text-sm rounded-lg py-2.5 transition-colors"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Verifying…' : 'Verify & Sign In'}
            </button>

            <div className="flex items-center justify-between text-xs pt-1">
              <button
                type="button"
                onClick={backToCredentials}
                className="flex items-center gap-1 text-txt-muted hover:text-txt-secondary"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={resending || resendCooldown > 0}
                className="text-brand hover:text-brand-hover disabled:text-txt-dim disabled:cursor-not-allowed"
              >
                {resending ? 'Sending…' : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}

        <p className="text-center text-xs text-txt-dim mt-6">
          Single-operator access · TradePulse PRO
        </p>
      </div>
    </div>
  );
};
