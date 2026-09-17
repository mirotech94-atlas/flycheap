import type { AppNavDict } from "@/lib/i18n/app.en";

/**
 * One shared icon set for every navigation surface (top nav + mobile bottom
 * tabs) so the portal reads as a single system. Stroke-based, 24-grid,
 * currentColor — the nav controls size and colour.
 */
const P = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const NAV_ICONS: Partial<Record<keyof AppNavDict, React.ReactNode>> = {
  dashboard: (<><path d="M3 11.5 12 4l9 7.5" {...P} /><path d="M5.5 10v9.5h13V10" {...P} /></>),
  home: (<><path d="M3 11.5 12 4l9 7.5" {...P} /><path d="M5.5 10v9.5h13V10" {...P} /></>),
  explore: (<><circle cx="12" cy="12" r="8.5" {...P} /><path d="m15 9-2.2 5.2L7.6 16l2.2-5.2L15 9Z" {...P} /></>),
  offers: (<><path d="M20.3 13.1 13.1 20.3a1.8 1.8 0 0 1-2.5 0l-7-7A1.8 1.8 0 0 1 3 12V4.8A1.8 1.8 0 0 1 4.8 3H12a1.8 1.8 0 0 1 1.3.5l7 7a1.8 1.8 0 0 1 0 2.6Z" {...P} /><circle cx="7.8" cy="7.8" r="1.4" {...P} /></>),
  hotels: (<><path d="M3 19v-7.5A1.5 1.5 0 0 1 4.5 10h15a1.5 1.5 0 0 1 1.5 1.5V19" {...P} /><path d="M3 16h18M3 19h18" {...P} /><path d="M6.5 10V7.5A1.5 1.5 0 0 1 8 6h3a1.5 1.5 0 0 1 1.5 1.5V10" {...P} /></>),
  flights: (<><path d="M17.6 18.8 16 11.4l3.1-3.1a1.8 1.8 0 1 0-2.5-2.5l-3.1 3.1L6.1 7.2a.5.5 0 0 0-.5.9l4.4 2.7-2.1 2.1-2-.4-.9.9 2.6 1.5 1.5 2.6.9-.9-.4-2 2.1-2.1 2.7 4.4a.5.5 0 0 0 .9-.5Z" {...P} /></>),
  routes: (<><circle cx="6" cy="6.5" r="2.5" {...P} /><circle cx="18" cy="17.5" r="2.5" {...P} /><path d="M8.5 6.5h5a3.5 3.5 0 0 1 0 7h-3a3.5 3.5 0 0 0 0 7h5" {...P} /></>),
  guides: (<><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5Z" {...P} /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z" {...P} /></>),
  pricing: (<><rect x="3" y="6" width="18" height="12" rx="2" {...P} /><path d="M3 10.5h18" {...P} /><path d="M7 14.5h3" {...P} /></>),
  searches: (<><circle cx="11" cy="11" r="6.5" {...P} /><path d="m16 16 4.5 4.5" {...P} /></>),
  integrations: (<><path d="M9 3v5M15 3v5" {...P} /><rect x="6" y="8" width="12" height="7" rx="2" {...P} /><path d="M12 15v3.5a2.5 2.5 0 0 1-2.5 2.5H8" {...P} /></>),
  settings: (<><circle cx="12" cy="12" r="3" {...P} /><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" {...P} /></>),
  profile: (<><circle cx="12" cy="8.5" r="3.8" {...P} /><path d="M4.5 20c0-3.8 3.4-5.8 7.5-5.8s7.5 2 7.5 5.8" {...P} /></>),
};

/** Renders the icon for a nav key at `size` px. Returns null for unknown keys. */
export function NavIcon({ name, size = 20 }: { name: keyof AppNavDict; size?: number }) {
  const path = NAV_ICONS[name];
  if (!path) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {path}
    </svg>
  );
}
