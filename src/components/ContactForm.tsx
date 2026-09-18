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
      <div className="card text-center py-10">
        <div className="text-4xl mb-2">✅</div>
        <h2 className="!mb-1">Ticket opened</h2>
        <p className="text-sm text-slate-500">
          Thanks — we&apos;ll reply to <strong>{email}</strong> within one business day.
          {ref && <> Your ticket is <strong className="font-mono">{ref}</strong>; we&apos;ve emailed you a copy.</>}
        </p>
        <button onClick={() => setStatus('idle')} className="btn btn-sm mt-4">Send another</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="text-xs">
          <span className="block mb-1 text-slate-500">Your name *</span>
          <input
            required
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={80}
            className="w-full"
            placeholder="Jane Doe"
          />
        </label>
        <label className="text-xs">
          <span className="block mb-1 text-slate-500">Your email *</span>
          <input
            required
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            maxLength={200}
            className="w-full"
            placeholder="you@example.com"
          />
        </label>
      </div>

      <label className="text-xs block">
        <span className="block mb-1 text-slate-500">Subject (optional)</span>
        <input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          maxLength={120}
          className="w-full"
          placeholder="e.g. Billing question, partnership idea, bug report…"
        />
      </label>

      <label className="text-xs block">
        <span className="block mb-1 text-slate-500">Message * <span className="text-slate-400">(min 10 chars)</span></span>
        <textarea
          required
          value={message}
          onChange={e => setMessage(e.target.value)}
          minLength={10}
          maxLength={4000}
          rows={7}
          className="w-full font-sans"
          placeholder="Tell us what's on your mind…"
        />
        <span className="block text-right text-[10px] text-slate-400 mt-1">{message.length} / 4000</span>
      </label>

      {/* Honeypot — invisible to real users, bots fill it in. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
        <label>Company (leave blank)
          <input tabIndex={-1} autoComplete="off" value={company} onChange={e => setCompany(e.target.value)} />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={status === 'sending'} className="btn btn-primary">
          {status === 'sending' ? 'Sending…' : 'Send message'}
        </button>
        {err && <span className="text-sm text-red-600">{err}</span>}
      </div>

      <p className="text-[11px] text-slate-400">
        Your message goes directly to our inbox. We don&apos;t add you to any list and never sell email addresses.
      </p>
    </form>
  );
}
