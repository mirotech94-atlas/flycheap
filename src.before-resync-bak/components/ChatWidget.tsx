'use client';

import { useState, useRef, useEffect } from 'react';
import { useGlobe } from '@/lib/globeStore';
import type { FlightHudPayload } from '@/lib/flightHud';

type Msg = { role: 'user' | 'assistant'; content: string };
type ChatResponse = {
  reply?: string;
  error?: string;
  hud?: FlightHudPayload | null;
};

// --- Voice helpers (browser-native, free) -----------------------------------
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
};

function getSpeechRecognition(): { new(): SpeechRecognitionLike } | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: { new(): SpeechRecognitionLike };
    webkitSpeechRecognition?: { new(): SpeechRecognitionLike };
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** Pick a "concierge" voice — prefer en-GB / en-US female-leaning voices. */
function pickConciergeVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const preferred = [
    /Samantha/i, /Karen/i, /Serena/i, /Google.*UK.*Female/i,
    /Microsoft.*Aria/i, /en-GB.*Female/i, /en-US.*Female/i,
  ];
  for (const re of preferred) {
    const v = voices.find(v => re.test(v.name));
    if (v) return v;
  }
  return voices.find(v => v.lang.startsWith('en')) || voices[0];
}

const STORAGE_KEY = 'egyptair-chat-history-v1';

const INITIAL: Msg[] = [{
  role: 'assistant',
  content:
    "Hi — I'm your travel concierge. Ask anything: cheapest fares right now, alerts, booking dates, settings, or just say 'send me today's report'.",
}];

const QUICK_PROMPTS = [
  'Find the cheapest fare under $1100',
  "Send today's report to me",
  'List my active searches',
  'Show me deals to Cairo in July',
  'Cheapest weekend trip from NYC',
  'When is the best month to fly to Tokyo?',
];

function loadHistory(): Msg[] {
  if (typeof window === 'undefined') return INITIAL;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch { /* ignore */ }
  return INITIAL;
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>(INITIAL);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [chipIndex, setChipIndex] = useState(0);
  const [voiceMode, setVoiceMode] = useState(true); // TTS on/off
  const [recording, setRecording] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const globe = useGlobe();

  useEffect(() => {
    setMsgs(loadHistory());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-60)));
    } catch { /* ignore */ }
  }, [msgs]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, pending]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Cycle quick-prompt chips when chat is empty so user discovers more ideas
  useEffect(() => {
    if (msgs.length > 1) return;
    const id = setInterval(() => setChipIndex(i => (i + 1) % QUICK_PROMPTS.length), 4500);
    return () => clearInterval(id);
  }, [msgs.length]);

  // Detect voice support once.
  useEffect(() => {
    setVoiceSupported(!!getSpeechRecognition() && typeof window !== 'undefined' && !!window.speechSynthesis);
    // Trigger voices to load (some browsers populate async)
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function startRecording() {
    const SR = getSpeechRecognition();
    if (!SR) return;
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      send(transcript);
    };
    rec.onend = () => { setRecording(false); globe.setListening(false); };
    rec.onerror = () => { setRecording(false); globe.setListening(false); };
    recognitionRef.current = rec;
    setRecording(true);
    globe.setListening(true);
    globe.setStatusLine('// LISTENING · MIC OPEN');
    rec.start();
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    setRecording(false);
    globe.setListening(false);
  }

  function speak(text: string) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const v = pickConciergeVoice();
    if (v) utter.voice = v;
    utter.rate = 1.02;
    utter.pitch = 1.05;
    utter.onstart = () => {
      globe.setSpeaking(true);
      globe.setStatusLine('// CONCIERGE TRANSMITTING');
    };
    utter.onend = () => {
      globe.setSpeaking(false);
      globe.setStatusLine('// LINK IDLE · STANDING BY');
    };
    window.speechSynthesis.speak(utter);
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setErr(null);
    const next: Msg[] = [...msgs, { role: 'user', content: trimmed }];
    setMsgs(next);
    setInput('');
    setPending(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) }),
      });
      const j = await res.json() as ChatResponse;
      if (!res.ok) {
        setErr(j.error || `HTTP ${res.status}`);
      } else {
        const reply = j.reply || '(no reply)';
        setMsgs([...next, { role: 'assistant', content: reply }]);
        if (j.hud) globe.recordFlightHud(j.hud);
        else globe.reactToReply(reply);
        if (voiceMode) speak(reply);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  // Rotate which 3 chips are visible at a time
  const visibleChips = [
    QUICK_PROMPTS[chipIndex % QUICK_PROMPTS.length],
    QUICK_PROMPTS[(chipIndex + 1) % QUICK_PROMPTS.length],
    QUICK_PROMPTS[(chipIndex + 2) % QUICK_PROMPTS.length],
  ];

  return (
    <>
      {/* Floating launcher */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close chat' : 'Open chat'}
        className={`fixed bottom-24 left-6 md:bottom-6 z-40 group flex items-center gap-2 px-4 py-3 rounded-full text-white shadow-lift transition-all no-print ${
          open
            ? 'bg-slate-800 hover:bg-slate-900'
            : 'bg-brand-gradient hover:scale-105 motion-pulse'
        }`}
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
        ) : (
          <>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span className="font-semibold text-sm hidden md:inline">Ask concierge</span>
          </>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-44 left-6 md:bottom-24 z-40 w-[400px] max-w-[calc(100vw-32px)] h-[600px] max-h-[calc(100vh-180px)] flex flex-col rounded-2xl shadow-lift border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900 motion-slide-right no-print">
          {/* Gradient header with avatar + status */}
          <div className="relative bg-brand-gradient text-white px-4 py-3 flex items-center justify-between overflow-hidden">
            <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-brand-gold/20 blur-2xl pointer-events-none" />
            <div className="relative flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center text-lg backdrop-blur">
                  ✈️
                </div>
                <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-brand-700" />
              </div>
              <div>
                <div className="font-display font-bold text-sm leading-tight">Nadia · Flight Concierge</div>
                <div className="text-[10px] text-white/70 flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-emerald-400" /> Voice persona · HUD linked
                </div>
              </div>
            </div>
            <div className="relative flex items-center gap-1">
              <button
                onClick={() => {
                  if (confirm('Clear chat history?')) {
                    setMsgs(INITIAL);
                    if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY);
                  }
                }}
                className="text-white/70 hover:text-white text-[10px] uppercase tracking-wider px-2 py-1 rounded hover:bg-white/10"
                title="Clear conversation"
              >
                clear
              </button>
            </div>
          </div>

          {/* Message stream */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
            {msgs.map((m, i) => (
              <div key={i} className={`flex items-end gap-2 motion-fade-in ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-brand-gradient flex items-center justify-center text-xs shrink-0">✈️</div>
                )}
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap leading-relaxed shadow-soft ${
                  m.role === 'user'
                    ? 'bg-brand-gradient text-white rounded-br-sm'
                    : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-bl-sm'
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {pending && (
              <div className="flex items-end gap-2">
                <div className="w-7 h-7 rounded-full bg-brand-gradient flex items-center justify-center text-xs shrink-0">✈️</div>
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-bl-sm px-3.5 py-2.5 shadow-soft">
                  <span className="inline-flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" />
                    <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '120ms' }} />
                    <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '240ms' }} />
                  </span>
                </div>
              </div>
            )}
            {err && (
              <div className="mx-auto bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2 text-xs max-w-[90%] motion-fade-in">
                ⚠️ {err}
              </div>
            )}
          </div>

          {/* Suggested prompt chips (rotate when conversation is fresh) */}
          {msgs.length <= 1 && (
            <div className="px-3 pb-2 pt-2 flex flex-wrap gap-1.5 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900">
              <div className="text-[10px] uppercase tracking-[0.14em] font-semibold text-slate-400 w-full mb-1">Try asking</div>
              {visibleChips.map(p => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  disabled={pending}
                  className="text-[11px] px-2.5 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-brand/5 hover:border-brand/30 hover:text-brand-700 disabled:opacity-50 transition motion-fade-in"
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Composer */}
          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="border-t border-slate-200 dark:border-slate-700 p-2 flex gap-2 bg-white dark:bg-slate-900"
          >
            <div className="flex-1 flex items-center gap-2 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/15 transition">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={recording ? 'Listening…' : 'Ask anything…'}
                disabled={pending || recording}
                className="flex-1 border-0 bg-transparent text-sm focus:outline-none focus:ring-0 px-0 py-1.5 shadow-none"
                style={{ boxShadow: 'none', borderColor: 'transparent' }}
              />
              {voiceSupported && (
                <button
                  type="button"
                  onClick={() => setVoiceMode(v => !v)}
                  className={`w-7 h-7 rounded-full grid place-items-center text-[11px] shrink-0 transition ${
                    voiceMode
                      ? 'bg-brand-gold/20 text-brand-700 ring-1 ring-brand-gold/40'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                  title={voiceMode ? 'Voice replies on' : 'Voice replies off'}
                  aria-pressed={voiceMode}
                >
                  {voiceMode ? '🔊' : '🔈'}
                </button>
              )}
            </div>
            {voiceSupported && (
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                disabled={pending}
                className={`w-10 h-10 rounded-full grid place-items-center disabled:opacity-40 hover:scale-105 transition shrink-0 ${
                  recording
                    ? 'bg-red-500 text-white motion-pulse'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
                aria-label={recording ? 'Stop recording' : 'Start voice input'}
                title={recording ? 'Stop' : 'Speak to concierge'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
                </svg>
              </button>
            )}
            {!voiceSupported && (
              <button
                type="button"
                disabled
                className="w-10 h-10 rounded-full grid place-items-center bg-slate-100 dark:bg-slate-800 text-slate-400 shrink-0"
                aria-label="Voice input is unavailable in this browser"
                title="Voice input needs browser speech recognition"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
                  <path d="M4 4l16 16" />
                </svg>
              </button>
            )}
            <button
              type="submit"
              disabled={pending || !input.trim()}
              className="w-10 h-10 rounded-full bg-brand-gradient text-white grid place-items-center disabled:opacity-40 hover:scale-105 transition shrink-0"
              aria-label="Send"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
