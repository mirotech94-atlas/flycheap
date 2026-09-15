import { Suspense } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { LoginForm } from '@/components/LoginForm';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <div className="-mx-6 -my-8 -mb-24 md:-mb-8 min-h-[calc(100vh-80px)] grid place-items-center bg-canvas">
      <div className="w-full max-w-md px-6">
        <div className="card card-elevated motion-fade-in">
          <Link href="/welcome" className="flex items-center gap-2 mb-5">
            <Logo size={40} />
            <div className="font-display font-bold text-slate-900 dark:text-white text-lg tracking-tight">
              Cheapflight Tracker<span className="text-brand-gold">.</span>
            </div>
          </Link>
          <div className="eyebrow text-brand-700">Sign in</div>
          <h1 className="font-display font-bold text-2xl text-slate-900 dark:text-white mt-1">
            Sign in with email
          </h1>
          <p className="text-sm text-slate-500 mt-1.5 mb-5">
            We&apos;ll email you a one-click magic link. No password needed.
          </p>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
          <p className="text-[11px] text-slate-400 mt-5 text-center">
            By continuing you agree to our terms. We never sell your data.
          </p>
        </div>
      </div>
    </div>
  );
}
