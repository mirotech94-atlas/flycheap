// FcConcierge — visual shell wrapper for the Concierge experience.
//
// The existing global <ChatWidget /> (mounted in src/app/layout.tsx) already provides
// a fixed bottom-right concierge with full voice/STT/TTS logic — we do NOT replace it.
// This component is a no-op render so the page can compose all 9 Fc* panels without
// duplicating the floating widget. The dark/gold concierge styling in globals.css
// (`.fc-concierge-*`) is retained for Phase 2, when we'll port ChatWidget's internals
// to use these styles directly.
//
// TODO (Phase 2): Move ChatWidget out of layout, restyle internals with .fc-concierge-*,
// and render here.
export function FcConcierge() {
  return null;
}
