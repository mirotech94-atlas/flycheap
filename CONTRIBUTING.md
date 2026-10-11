# Contributing

Pull requests are welcome. There is no CLA and no copyright assignment — MIT
covers it.

## Before you open one

```bash
npm install
npx vitest run                     # 715 tests, all of them must pass
npx tsc --noEmit -p tsconfig.json  # see the note below
```

The typecheck reports a handful of errors inside `.next/` for pages that were
deleted; they are stale build artifacts and regenerate. Nothing in `src/` or
`tests/` may error.

## What the tests are for

Most of them exist because something was wrong in production once, and the test
is there so it cannot come back. A few are worth knowing about before you
change nearby code:

- **`tests/api-auth.test.ts`** — `middleware.ts` deliberately does not cover
  `api/`, so every route guards itself. A new route that neither guards nor
  appears in `INTENTIONALLY_PUBLIC` (with a written reason) fails the suite.
  Being public is a decision about *reading*: a public route taking an
  unguarded write fails separately.
- **`tests/noHardcodedHex.test.ts`** — components use the 22 design tokens, not
  hex literals. The allowlist only ever shrinks.
- **`tests/copy-audit.test.ts`** — every customer-facing number is derived from
  the thing it describes, never typed. Nine false public claims were found and
  fixed before this rule existed.

## Style

- Comments explain *why*, especially where the obvious approach is wrong. If a
  line looks odd and the reason is not next to it, the reason is lost.
- No new hex in components. No invented numbers in copy.
- Small commits, one concern each.
