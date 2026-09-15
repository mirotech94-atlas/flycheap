'use client';

import { useEffect, useState } from 'react';
import { useToast } from './Toaster';

const CHANNELS = [
  { id: 'email',     label: 'Email',     hint: 'Always available · sent via Resend' },
  { id: 'slack',     label: 'Slack',     hint: 'Bot token (DMs / channels) or incoming webhook' },
  { id: 'telegram',  label: 'Telegram',  hint: 'Bot token via env + chat ID per user' },
  { id: 'whatsapp',  label: 'WhatsApp',  hint: 'Twilio Sandbox or paid number' },
  { id: 'sms',       label: 'SMS',       hint: 'Twilio standard messaging' },
] as const;

type Cfg = {
  alert_channels: string;
  alert_slack_target: string;
  alert_slack_webhook: string;
  alert_telegram_chat_id: string;
  alert_ig_user_id: string;
};

export function AlertChannelsCard() {
  const toast = useToast();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(j => {
      setCfg({
        alert_channels: j.alert_channels ?? 'email',
        alert_slack_target: j.alert_slack_target ?? '',
        alert_slack_webhook: j.alert_slack_webhook ?? '',
        alert_telegram_chat_id: j.alert_telegram_chat_id ?? '',
        alert_ig_user_id: j.alert_ig_user_id ?? '',
      });
    });
  }, []);

  if (!cfg) return null;

  const selected = new Set(cfg.alert_channels.split(',').map(s => s.trim()).filter(Boolean));

  function toggle(id: string) {
    setCfg(prev => {
      if (!prev) return prev;
      const next = new Set(prev.alert_channels.split(',').filter(Boolean));
      if (next.has(id)) next.delete(id); else next.add(id);
      return { ...prev, alert_channels: Array.from(next).join(',') };
    });
  }

  function field<K extends keyof Cfg>(k: K) {
    return (v: string) => setCfg(prev => prev ? { ...prev, [k]: v } : prev);
  }

  async function save() {
    if (!cfg) return;
    setSaving(true);
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    setSaving(false);
    if (res.ok) {
      toast.success('Channels saved', 'Future alerts will fan out to the channels you selected.');
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error('Save failed', typeof j.error === 'string' ? j.error : 'Try again.');
    }
  }

  async function test(channel: string) {
    setTesting(channel);
    const res = await fetch('/api/settings/test-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel }),
    });
    setTesting(null);
    const j = await res.json().catch(() => ({}));
    if (j.ok) {
      toast.success(`${channel} test sent`, j.id ? `id: ${j.id}` : 'Check that channel.');
    } else {
      toast.error(`${channel} test failed`, j.skipped || j.error || 'Unknown error');
    }
  }

  return (
    <div className="card" id="alerts">
      <div className="card-head">
        <div>
          <div className="eyebrow">Alerts &amp; channels</div>
          <h2 className="!mb-0">Where should alerts land?</h2>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Select every channel you want fare alerts on. Each fires only when its credentials are configured — others gracefully skip without erroring.
      </p>

      <div className="grid md:grid-cols-2 gap-2 mb-4">
        {CHANNELS.map(c => (
          <label
            key={c.id}
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
              selected.has(c.id)
                ? 'border-brand-700 bg-brand/5 dark:bg-brand-900/20'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'
            }`}
          >
            <input
              type="checkbox"
              checked={selected.has(c.id)}
              onChange={() => toggle(c.id)}
              className="mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{c.label}</div>
              <div className="text-[11px] text-slate-500">{c.hint}</div>
            </div>
            <button
              type="button"
              onClick={e => { e.preventDefault(); test(c.id); }}
              className="btn btn-sm shrink-0"
              disabled={testing === c.id}
              title="Send a test notification"
            >
              {testing === c.id ? '…' : 'Test'}
            </button>
          </label>
        ))}
      </div>

      {selected.has('slack') && (
        <div className="mb-4 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30">
          <div className="font-semibold text-sm text-slate-800 dark:text-slate-100 mb-2">Slack</div>
          <label className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 block mt-2">
            Bot-token target <span className="font-normal lowercase tracking-normal text-slate-400">(channel ID, user ID, or @user)</span>
          </label>
          <input
            value={cfg.alert_slack_target}
            onChange={e => field('alert_slack_target')(e.target.value)}
            placeholder="C0123ABC or U0123ABC or @you@example.com"
            className="w-full font-mono text-xs mt-1"
          />
          <p className="text-[10px] text-slate-500 mt-1">
            Requires <code>SLACK_BOT_TOKEN</code> in <code>.env.local</code>. Bot-token path can DM users — webhooks can&rsquo;t.
          </p>
          <label className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 block mt-3">
            Incoming webhook URL <span className="font-normal lowercase tracking-normal text-slate-400">(fallback — channel only)</span>
          </label>
          <input
            value={cfg.alert_slack_webhook}
            onChange={e => field('alert_slack_webhook')(e.target.value)}
            placeholder="https://hooks.slack.com/services/T…/B…/…"
            className="w-full font-mono text-xs mt-1"
          />
        </div>
      )}

      {selected.has('telegram') && (
        <div className="mb-4 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30">
          <div className="font-semibold text-sm text-slate-800 dark:text-slate-100 mb-2">Telegram</div>
          <label className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 block">Chat ID</label>
          <input
            value={cfg.alert_telegram_chat_id}
            onChange={e => field('alert_telegram_chat_id')(e.target.value)}
            placeholder="123456789"
            className="w-full font-mono text-xs mt-1"
          />
          <p className="text-[10px] text-slate-500 mt-1">
            Requires <code>TELEGRAM_BOT_TOKEN</code>. Get your chat ID by messaging the bot then visiting <code>api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code>.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button onClick={save} className="btn btn-primary btn-sm" disabled={saving}>
          {saving ? 'Saving…' : 'Save channels'}
        </button>
      </div>
    </div>
  );
}
