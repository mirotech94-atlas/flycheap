'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const ChatWidget = dynamic(() => import('./ChatWidget').then(m => m.ChatWidget), { ssr: false });
const GlobeHUD = dynamic(() => import('./GlobeHUD').then(m => m.GlobeHUD), { ssr: false });
const CompareTray = dynamic(() => import('./CompareTray').then(m => m.CompareTray), { ssr: false });
const MobileBottomNav = dynamic(() => import('./MobileBottomNav').then(m => m.MobileBottomNav), { ssr: false });

export function DeferredAppWidgets() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const schedule = window.requestIdleCallback
      ? window.requestIdleCallback(() => setReady(true), { timeout: 1800 })
      : window.setTimeout(() => setReady(true), 900);
    return () => {
      if (typeof schedule === 'number') window.clearTimeout(schedule);
      else window.cancelIdleCallback?.(schedule);
    };
  }, []);

  if (!ready) return null;
  return (
    <>
      <ChatWidget />
      <GlobeHUD />
      <CompareTray />
      <MobileBottomNav />
    </>
  );
}
