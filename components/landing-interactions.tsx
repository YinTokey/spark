'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './icon';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getError(value: unknown) {
  if (typeof value !== 'object' || value === null || !('error' in value)) return null;
  return typeof value.error === 'string' ? value.error : null;
}

type AuthMode = 'login' | 'register';

export function ActionButton({ variant, invitationCodeRequired }: { variant: 'demo' | 'access'; invitationCodeRequired: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const request = useRef<AbortController | null>(null);
  const [mode, setMode] = useState<AuthMode>('login');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isDemo = variant === 'demo';

  useEffect(() => () => request.current?.abort(), []);

  function resetAuth() {
    request.current?.abort();
    request.current = null;
    form.current?.reset();
    setSubmitting(false);
    setError('');
    setMessage('');
  }

  function openDialog() {
    setMode('login');
    resetAuth();
    dialog.current?.showModal();
  }

  function selectMode(nextMode: AuthMode) {
    resetAuth();
    setMode(nextMode);
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') ?? '').trim();
    const confirmEmail = String(data.get('confirmEmail') ?? '').trim();
    const password = String(data.get('password') ?? '');
    const invitationCode = String(data.get('invitationCode') ?? '');
    if (!emailPattern.test(email) || email.length > 254) {
      setError(mode === 'register' ? 'Register with a valid email and a password of at least 6 characters.' : 'Enter a valid email address.');
      return;
    }
    if (mode === 'register' && email !== confirmEmail) {
      setError('Email addresses do not match.');
      return;
    }
    if (mode === 'register' && invitationCodeRequired && invitationCode !== 'sparkvid') {
      setError('Enter a valid invitation code.');
      return;
    }
    if (password.length < 6) {
      setError(mode === 'register' ? 'Register with a valid email and a password of at least 6 characters.' : 'Password must be at least 6 characters.');
      return;
    }

    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'register'
          ? { mode, email, confirmEmail, password, ...(invitationCodeRequired ? { invitationCode } : {}) }
          : { mode, email, password }),
        signal: controller.signal,
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        setError(getError(result) ?? 'Could not continue. Please try again.');
        return;
      }
      if (typeof result === 'object' && result !== null && 'message' in result && typeof result.message === 'string') {
        setMessage(result.message);
        form.current?.reset();
        return;
      }
      router.push('/home');
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError('Could not connect. Please try again.');
    } finally {
      if (request.current === controller) {
        request.current = null;
        setSubmitting(false);
      }
    }
  }

  return <>
    <button className="pill-button" onClick={openDialog}>
      {isDemo ? 'Try the demo' : 'Get Early Access'}<Icon name="arrow" />
    </button>
    <dialog ref={dialog} className="spark-dialog" aria-labelledby={`${variant}-title`} onClose={resetAuth}>
      <button className="dialog-close" aria-label="Close dialog" onClick={() => dialog.current?.close()}><Icon name="close" /></button>
      {isDemo ? <>
        <p className="eyebrow">SPARK · YOUR IDEAS, READY WHEN YOU ARE</p>
        <div className="auth-tabs" role="group" aria-label="Account access">
          <button type="button" className={mode === 'login' ? 'active' : ''} aria-pressed={mode === 'login'} onClick={() => selectMode('login')}>Log in</button>
          <button type="button" className={mode === 'register' ? 'active' : ''} aria-pressed={mode === 'register'} onClick={() => selectMode('register')}>Register</button>
        </div>
        <h2 id="demo-title">{mode === 'login' ? 'Welcome to Spark.' : 'Create your account.'}</h2>
        <p className="auth-copy">{mode === 'login' ? 'Pick up where your ideas left off.' : 'Register with a valid email and a password of at least 6 characters.'}</p>
        <form ref={form} className="auth-form" noValidate onSubmit={submitAuth}>
          <label htmlFor="auth-email">Email</label>
          <input id="auth-email" name="email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" maxLength={254} disabled={submitting} />
          {mode === 'register' && <>
            <label htmlFor="auth-confirm-email">Confirm email</label>
            <input id="auth-confirm-email" name="confirmEmail" type="email" inputMode="email" autoComplete="email" placeholder="Enter your email again" maxLength={254} disabled={submitting} />
            {invitationCodeRequired && <>
              <label htmlFor="auth-invitation-code">Invitation code</label>
              <input id="auth-invitation-code" name="invitationCode" type="text" autoComplete="off" disabled={submitting} />
            </>}
          </>}
          <label htmlFor="auth-password">Password</label>
          <input id="auth-password" name="password" type="password" placeholder="At least 6 characters" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} maxLength={72} disabled={submitting} />
          {error && <p className="auth-feedback error" role="alert">{error}</p>}
          {message && <p className="auth-feedback" role="status">{message}</p>}
          <button className="pill-button" type="submit" disabled={submitting}>{submitting ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}<Icon name="arrow" /></button>
        </form>
      </> : <>
        <p className="eyebrow">SPARK · EARLY ACCESS</p>
        <div className="demo-orb"><Icon name="sparkle" /></div>
        <h2 id="access-title">Good things are taking shape.</h2>
        <p className="demo-copy">Sign-ups aren’t open yet. Come back soon for early access to Spark.</p>
        <button className="pill-button" onClick={() => dialog.current?.close()}>Got it<Icon name="check" /></button>
      </>}
    </dialog>
  </>;
}
