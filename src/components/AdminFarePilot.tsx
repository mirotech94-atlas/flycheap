'use client';

import { useCallback, useRef, useState } from 'react';

type Role = 'user' | 'assistant';
type ToolCall = { name: string; input: unknown; result_preview: string };
type Msg = { role: Role; content: string; tools?: ToolCall[]; provider?: string; error?: boolean };

function render(text: string) {
  const parts = text.split(/```/);
  return parts.map((chunk, i) => {
    if (i % 2 === 1) return <pre key={i} className="ed-code my-2 overflow-x-auto whitespace-pre-wrap" style={{ display: 'block' }}>{chunk.replace(/^\w*\n/, '')}</pre>;
    const html = chunk
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="ed-code">$1</code>')
      .replace(/\n/g, '<br/>');
    return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
  });
}

function EnrolCard({ onDone }: { onDone: () => void }) {
  const [secret, setSecret] = useState('');
  const [otpauth, setOtpauth] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const begin = useCallback(async () => {
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/admin/farepilot/enroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'begin' }) });
      const d = await res.json();
      if (res.ok) { setSecret(d.secret); setOtpauth(d.otpauth); } else setErr(d.error || 'Failed to start enrolment.');
    } finally { setBusy(false); }
  }, []);

  const confirm = useCallback(async () => {
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/admin/farepilot/enroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirm', secret, code: code.replace(/\D/g, '') }) });
      const d = await res.json();
      if (res.ok) onDone(); else setErr(d.error || 'That code did not verify.');
    } finally { setBusy(false); }
  }, [secret, code, onDone]);

  return (
    <div className="ad-panel ad-panel-gold">
      <div className="ad-eyebrow ad-tone-warn mb-1">Enable two-factor to run SQL / shell</div>
      <p className="mb-2 text-xs ad-note">Read-only questions work now. Running SQL or shell needs an authenticator code, so set one up:</p>
      {!secret ? (
        <button onClick={begin} disabled={busy} className="ad-btn ad-btn-gold">Start 2FA setup</button>
      ) : (
        <div className="space-y-2 text-xs">
          <div>1. Add this to your authenticator app (Google Authenticator, 1Password, etc.):</div>
          <div className="ed-code break-all" style={{ display: 'block' }}>{otpauth}</div>
          <div>Or enter the secret manually: <span className="font-mono font-semibold">{secret}</span></div>
          <div className="flex items-center gap-2 pt-1">
            <span>2. Enter the current 6-digit code:</span>
            <input value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="123456" className="ad-input tracking-widest" />
            <button onClick={confirm} disabled={busy} className="ad-btn ad-btn-gold">Confirm</button>
          </div>
        </div>
      )}
      {err && <div className="mt-1 text-xs ad-tone-bad">{err}</div>}
    </div>
  );
}

export function AdminFarePilot({ totpEnabled }: { totpEnabled: boolean }) {
  const [enabled, setEnabled] = useState(totpEnabled);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [stepUpNeeded, setStepUpNeeded] = useState(false);
  const [code, setCode] = useState('');
  const [codeErr, setCodeErr] = useState('');
  const lastSent = useRef<Msg[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const scroll = () => requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }));

  const post = useCallback(async (history: Msg[], totp?: string) => {
    const res = await fetch('/api/admin/farepilot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history.map(m => ({ role: m.role, content: m.content })), ...(totp ? { totp } : {}) }) });
    return { res, data: await res.json().catch(() => ({})) };
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: text }];
    setMsgs(next); setInput(''); setBusy(true); setStepUpNeeded(false);
    lastSent.current = next;
    try {
      const { res, data } = await post(next);
      if (!res.ok) setMsgs(m => [...m, { role: 'assistant', content: data.error || `Error ${res.status}`, error: true }]);
      else { setMsgs(m => [...m, { role: 'assistant', content: data.reply || '(no reply)', tools: data.tool_calls, provider: data.provider }]); if (data.needs_totp) setStepUpNeeded(true); }
    } catch (e) { setMsgs(m => [...m, { role: 'assistant', content: (e as Error).message, error: true }]); }
    finally { setBusy(false); scroll(); }
  }, [input, busy, msgs, post]);

  const unlock = useCallback(async () => {
    const c = code.replace(/\D/g, '');
    if (c.length !== 6 || busy) { setCodeErr('Enter the 6-digit code.'); return; }
    setBusy(true); setCodeErr('');
    try {
      const { res, data } = await post(lastSent.current, c);
      if (res.status === 429 || res.status === 401) { setCodeErr(data.error || 'That code did not verify.'); return; }
      if (!res.ok) { setMsgs(m => [...m, { role: 'assistant', content: data.error || `Error ${res.status}`, error: true }]); setStepUpNeeded(false); }
      else { setMsgs(m => [...m, { role: 'assistant', content: data.reply || '(no reply)', tools: data.tool_calls, provider: data.provider }]); setStepUpNeeded(!!data.needs_totp); setCode(''); }
    } catch (e) { setMsgs(m => [...m, { role: 'assistant', content: (e as Error).message, error: true }]); }
    finally { setBusy(false); scroll(); }
  }, [code, busy, post]);

  return (
    <div className="space-y-4">
      {!enabled && <EnrolCard onDone={() => setEnabled(true)} />}
      <div className="ad-panel flex h-[68vh] flex-col p-0">
        <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto p-4">
          {msgs.length === 0 && (
            <div className="mx-auto mt-10 max-w-md text-center text-sm ad-note">
              <div className="mb-2 text-2xl">🛩️</div>
              Ask me to look up a client, inspect the database, check the poller, or fix something.
              <div className="mt-2 text-[11px]" style={{ color: 'var(--muted-2)' }}>Read-only questions run immediately. Running SQL or shell asks for your authenticator code first (once per 10 minutes).</div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={`ed-chat-bubble max-w-[85%] ${m.role === 'user' ? 'user' : 'assistant'}`}
                style={m.error ? { borderColor: 'var(--red)', color: 'var(--red)' } : undefined}
              >
                {m.tools && m.tools.length > 0 && (
                  <div className="mb-2 space-y-1">
                    {m.tools.map((t, k) => (
                      <details key={k} className="text-[11px]">
                        <summary className="cursor-pointer font-mono ad-note">⚙ {t.name}({JSON.stringify(t.input).slice(0, 80)})</summary>
                        <pre className="ed-code mt-1 overflow-x-auto whitespace-pre-wrap" style={{ display: 'block' }}>{t.result_preview}</pre>
                      </details>
                    ))}
                  </div>
                )}
                <div>{render(m.content)}</div>
                {m.provider && <div className="mt-1 text-[10px]" style={{ color: 'var(--muted-2)' }}>via {m.provider}</div>}
              </div>
            </div>
          ))}
          {busy && <div className="text-xs ad-note">FarePilot is working…</div>}
        </div>

        {stepUpNeeded && enabled && (
          <div className="flex items-center gap-2 p-3" style={{ borderTop: '1px solid var(--amber)', background: 'color-mix(in srgb, var(--amber) 8%, var(--surface))' }}>
            <span className="text-xs ad-tone-warn">Enter your authenticator code to run that action:</span>
            <input value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="123456" onKeyDown={e => { if (e.key === 'Enter') unlock(); }} className="ad-input tracking-widest" />
            <button onClick={unlock} disabled={busy} className="ad-btn ad-btn-gold">Unlock</button>
            {codeErr && <span className="text-xs ad-tone-bad">{codeErr}</span>}
          </div>
        )}

        <div className="flex gap-2 p-3" style={{ borderTop: '1px solid var(--rule)' }}>
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} rows={1} placeholder="Ask FarePilot to inspect or fix something…" className="ed-input flex-1 resize-none" />
          <button onClick={send} disabled={busy || !input.trim()} className="ed-btn ed-btn-primary">Send</button>
        </div>
      </div>
    </div>
  );
}
