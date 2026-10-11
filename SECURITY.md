# Security

## Reporting

Open a private security advisory on the repository, or email the address in
`package.json`. Please do not open a public issue for anything exploitable.

I will confirm receipt, and I would rather hear about something small than not
hear about it.

## Running your own copy

A few things are easy to get wrong when self-hosting, so they are stated here
rather than left to be discovered:

- **`.env.local` is never committed** and never should be. `.env.example` lists
  every variable with no values.
- **The API guards itself.** `middleware.ts` excludes `api/`, so each handler
  makes its own authorisation decision. If you add a route, read
  `tests/api-auth.test.ts` first — it will fail your build otherwise, which is
  the point.
- **Owner-only surfaces** (`/admin/**`, the FarePilot operator console) are
  gated on the owner account *and* the admin host *and* same-origin, and the
  operator console additionally requires a TOTP step-up whenever an
  authenticator is configured. Do not relax one of those and assume the others
  carry it.
- **Secrets are never logged.** The reasoner is shown `"the provider returned
  401"`, never the key. `src/lib/_http.ts`'s `redact()` exists for that.
- **Unsigned webhooks are refused.** A webhook that cannot verify its signature
  returns 403 rather than trusting the body.
