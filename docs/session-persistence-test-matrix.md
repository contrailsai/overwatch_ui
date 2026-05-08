# Session Persistence Test Matrix

Target policy: users remain authenticated for ~30 days unless they sign out or are explicitly revoked.

## Preconditions

- Supabase Authentication session settings are aligned with 30-day persistence.
- User starts from a fresh login in production-like environment.
- Browser devtools is open on Application -> Cookies.
- Logs are visible for middleware/auth route diagnostics.

## Scenarios

| Scenario | Steps | Expected result | Status | Notes |
|---|---|---|---|---|
| Idle 15 minutes | Login, stay idle 15m, navigate to protected route | Stays logged in, no redirect to `/login` | Pending |  |
| Idle 30 minutes | Login, stay idle 30m, hard refresh protected route | Stays logged in, session refresh succeeds | Pending |  |
| Idle 60 minutes | Login, stay idle 60m, trigger server action | Stays logged in, action succeeds | Pending |  |
| Overnight idle | Login, leave tab idle overnight, open protected page | Stays logged in or refreshes seamlessly | Pending |  |
| Background/resume | Login, background tab for 30m, resume and navigate | No forced logout loop | Pending |  |
| Callback flow | Login via callback route, navigate to dashboard | Session established and persists | Pending |  |
| Explicit signout | Sign out, return to protected route | Redirects to `/login` | Pending |  |

## Diagnostic Signals to Capture

- `[auth.middleware] session check completed`
- `[auth.middleware] redirecting unauthenticated request`
- `[auth.login] login success` / failure log
- `[auth.callback] exchangeCodeForSession success` / failure log
- `[auth.signout] signOut success`

## Exit Criteria

- All scenario statuses are marked Pass.
- No unexpected redirect to `/login` in idle scenarios.
- No role/permission regression on protected dashboard routes.
