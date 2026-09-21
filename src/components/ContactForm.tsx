'use client';

import { useState } from 'react';
import { useToast } from './Toaster';

export function ContactForm({ initialEmail = '', initialName = '' }: { initialEmail?: string; initialName?: string }) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [company, setCompany] = useState(''); // honeypot
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const toast = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setStatus('sending');
    try {
      const r = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message, company }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setStatus('error');
        const m = j.error || `HTTP ${r.status}`;
        setErr(m);
        toast.error('Message not sent', m);
        return;
      }
      setStatus('sent');
      setRef(typeof j.ref === 'string' ? j.ref : null);
      setSubject(''); setMessage('');
      toast.success('Ticket opened', `We'll reply to ${email} within one business day.`);
    } catch (e) {
      setStatus('error');
      const m = (e as Error).message;
      setErr(m);
      toast.error('Network error', m);
    }
  }

  if (status === 'sent') {
    return (
      <div className="ed-panel" style={{ textAlign: 'center', padding: '40px 24px' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
        <h2 className="ed-h2" style={{ marginBottom: 8 }}>Ticket opened</h2>
        <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>
          Thanks — we&apos;ll reply to <strong>{email}</strong> within one business day.
          {ref && <> Your ticket is <strong className="ed-mono" style={{ textTransform: 'none', letterSpacing: 0 }}>{ref}</strong>; we&apos;ve emailed you a copy.</>}
        </p>
        <button onClick={() => setStatus('idle')} className="ed-btn ed-btn-secondary" style={{ marginTop: 16 }}>Send another</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="ed-panel" style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <div>
          <label className="ed-label">Your name *</label>
          <input
            required
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={80}
            className="ed-input"
            placeholder="Jane Doe"
          />
        </div>
        <div>
          <label className="ed-label">Your email *</label>
          <input
            required
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            maxLength={200}
            className="ed-input"
            placeholder="you@example.com"
          />
        </div>
      </div>

      <div>
        <label className="ed-label">Subject (optional)</label>
        <input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          maxLength={120}
          className="ed-input"
          placeholder="e.g. Billing question, partnership idea, bug report…"
        />
      </div>

      <div>
        <label className="ed-label">Message * (min 10 chars)</label>
        <textarea
          required
          value={message}
          onChange={e => setMessage(e.target.value)}
          minLength={10}
          maxLength={4000}
          rows={7}
          className="ed-input"
          style={{ resize: 'vertical' }}
          placeholder="Tell us what's on your mind…"
        />
        <span className="ed-field-hint" style={{ textAlign: 'right' }}>{message.length} / 4000</span>
      </div>

      {/* Honeypot — invisible to real users, bots fill it in. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
        <label>Company (leave blank)
          <input tabIndex={-1} autoComplete="off" value={company} onChange={e => setCompany(e.target.value)} />
        </label>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="submit" disabled={status === 'sending'} className="ed-btn ed-btn-primary">
          {status === 'sending' ? 'Sending…' : 'Send message'}
        </button>
        {err && <span style={{ fontSize: 13, color: 'var(--red)' }}>{err}</span>}
      </div>

      <p className="ed-field-hint">
        Your message goes directly to our inbox. We don&apos;t add you to any list and never sell email addresses.
      </p>
    </form>
  );
}
