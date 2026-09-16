'use client';

import { useCallback, useRef, useState } from 'react';

type Role = 'user' | 'assistant';
type ToolCall = { name: string; input: unknown; result_preview: string };
type Msg = { role: Role; content: string; tools?: ToolCall[]; provider?: string; error?: boolean };

// Minimal, safe formatter: fenced code blocks -> <pre>, **bold**, and line breaks.
function render(text: string) {
  const parts = text.split(/```/);
  return parts.map((chunk, i) => {
    if (i % 2 === 1) {
      return <pre key={i} className="my-2 overflow-x-auto rounded bg-slate-900/90 p-3 text-[11px] leading-snug text-slate-100 whitespace-pre-wrap">{chunk.replace(/^\w*\n/, '')}</pre>;
    }
    const html = chunk
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="rounded bg-slate-200/70 dark:bg-slate-700/70 px-1 text-[12px]">$1</code>')
      .replace(/\n/g, '<br/>');
    return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
  });
}

export function AdminFarePilot() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: text }];
    setMsgs(next);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/admin/farepilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsgs(m => [...m, { role: 'assistant', content: data.error || `Error ${res.status}`, error: true }]);
      } else {
        setMsgs(m => [...m, { role: 'assistant', content: data.reply || '(no reply)', tools: data.tool_calls, provider: data.provider }]);
      }
    } catch (e) {
      setMsgs(m => [...m, { role: 'assistant', content: (e as Error).message, error: true }]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }));
    }
  }, [input, busy, msgs]);

  return (
    <div className="card flex h-[70vh] flex-col p-0">
      <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto p-4">
        {msgs.length === 0 && (
          <div className="mx-auto mt-10 max-w-md text-center text-sm text-slate-500">
            <div className="mb-2 text-2xl">🛩️</div>
            Ask me to look up a client, inspect the database, check the poller, or fix something.
            <div className="mt-2 text-[11px] text-slate-400">e.g. “show me boxer.12.boys’ searches”, “why did the poller stop writing”, “bump user 3 to the pro plan”.</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
              m.role === 'user' ? 'bg-blue-600 text-white'
                : m.error ? 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300'
                : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'}`}>
              {m.tools && m.tools.length > 0 && (
                <div className="mb-2 space-y-1">
                  {m.tools.map((t, k) => (
                    <details key={k} className="text-[11px]">
                      <summary className="cursor-pointer font-mono text-slate-500">⚙ {t.name}({JSON.stringify(t.input).slice(0, 80)})</summary>
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-slate-900/80 p-2 text-[10px] text-slate-200">{t.result_preview}</pre>
                    </details>
                  ))}
                </div>
              )}
              <div>{render(m.content)}</div>
              {m.provider && <div className="mt-1 text-[10px] text-slate-400">via {m.provider}</div>}
            </div>
          </div>
        ))}
        {busy && <div className="text-xs text-slate-400">FarePilot is working…</div>}
      </div>
      <div className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-700">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          rows={1}
          placeholder="Ask FarePilot to inspect or fix something…"
          className="flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
        />
        <button onClick={send} disabled={busy || !input.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          Send
        </button>
      </div>
    </div>
  );
}
