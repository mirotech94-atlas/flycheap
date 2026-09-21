'use client';

import { ConciergeAvatar, WingsMark } from '@/components/ConciergeAvatar';
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
        className="ed-btn ed-btn-primary ed-fab fixed bottom-24 right-6 md:bottom-6 z-40 no-print"
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
        ) : (
          <WingsMark size={24} />
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="ed-widget-panel fixed bottom-44 right-6 md:bottom-24 z-40 w-[400px] max-w-[calc(100vw-32px)] h-[600px] max-h-[calc(100vh-180px)] motion-slide-right no-print">
          {/* Header with avatar + status */}
          <div className="ed-widget-head">
            <div className="flex items-center gap-3">
              <ConciergeAvatar size="md" />
              <div>
                <div className="ed-widget-head-title">FarePilot · Flight Concierge</div>
                <div className="ed-widget-head-meta">
                  <span className="ed-dot" /> Voice persona · HUD linked
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  if (confirm('Clear chat history?')) {
                    setMsgs(INITIAL);
                    if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY);
                  }
                }}
                className="ed-widget-head-btn"
                title="Clear conversation"
              >
                clear
              </button>
            </div>
          </div>

          {/* Message stream */}
          <div ref={scrollRef} className="ed-chat-messages">
            {msgs.map((m, i) => (
              <div key={i} className={`ed-chat-row motion-fade-in ${m.role === 'user' ? 'user' : ''}`}>
                {m.role === 'assistant' && (
                  <span className="ed-chat-icon"><WingsMark size={16} /></span>
                )}
                <div className={`ed-chat-bubble ${m.role === 'user' ? 'user' : 'assistant'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {pending && (
              <div className="ed-chat-row">
                <span className="ed-chat-icon"><WingsMark size={16} /></span>
                <div className="ed-chat-bubble assistant">
                  <span className="inline-flex gap-1">
                    <span className="ed-dot muted animate-bounce" />
                    <span className="ed-dot muted animate-bounce" style={{ animationDelay: '120ms' }} />
                    <span className="ed-dot muted animate-bounce" style={{ animationDelay: '240ms' }} />
                  </span>
                </div>
              </div>
            )}
            {err && (
              <div className="ed-chat-error motion-fade-in">
                ⚠️ {err}
              </div>
            )}
          </div>

          {/* Suggested prompt chips (rotate when conversation is fresh) */}
          {msgs.length <= 1 && (
            <div className="ed-chat-chips">
              <div className="ed-chat-chips-label ed-eyebrow">Try asking</div>
              {visibleChips.map(p => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  disabled={pending}
                  className="ed-chip motion-fade-in"
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Composer */}
          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="ed-chat-composer"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={recording ? 'Listening…' : 'Ask anything…'}
              disabled={pending || recording}
              className="ed-input"
              style={{ flex: 1 }}
            />
            {voiceSupported && (
              <button
                type="button"
                onClick={() => setVoiceMode(v => !v)}
                className="ed-btn ed-chat-toggle"
                style={voiceMode ? { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)' } : { background: 'var(--surface)', color: 'var(--ink-soft)', borderColor: 'var(--rule-strong)' }}
                title={voiceMode ? 'Voice replies on' : 'Voice replies off'}
                aria-pressed={voiceMode}
              >
                {voiceMode ? '🔊' : '🔈'}
              </button>
            )}
            {voiceSupported && (
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                disabled={pending}
                className="ed-btn ed-chat-mic disabled:opacity-40"
                style={recording ? { background: 'var(--red)', color: 'var(--on-accent)', borderColor: 'var(--red)' } : { background: 'var(--surface)', color: 'var(--ink-soft)', borderColor: 'var(--rule-strong)' }}
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
                className="ed-btn ed-btn-secondary ed-chat-mic disabled:opacity-40"
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
              className="ed-btn ed-btn-primary ed-chat-send disabled:opacity-40"
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
