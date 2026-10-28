# Analytics and security configuration

GA4 account and property: **Scrum Game**, account `413722757`, property `561102295`.
Web stream: `16223059049`, measurement ID `G-ECX1QTM93L`.
Site: https://scrum-game-ckpj.onrender.com/
Reporting time zone: Türkiye (UTC+03:00).

The browser loads Google Analytics only after a visitor selects **Allow analytics**.
Visitors can change or withdraw consent using **Analytics preferences**. Advertising
storage, ad personalization and Google signals are disabled. Only page views are
configured; room identifiers, query strings, fragments, referrers, usernames, votes,
story titles, emails and feedback are excluded from the configured payloads.
Enhanced measurement is disabled in this GA4 stream to prevent automatic form,
link and history events from sending room details. Keep it disabled.

Deploy the pull request before expecting live data. After deployment, open the
site, allow analytics and check the new property's Realtime report. Local tests
validate consent and payload sanitization but do not prove live Google ingestion.

## Feedback administration

`/feedbacks` and `/api/feedbacks` are disabled (404) until the deployment has a
strong, randomly generated `FEEDBACK_ADMIN_TOKEN` environment variable. With it
configured, HTTP Basic authentication uses username `admin` and that token as
the password. Use HTTPS. Never commit this token or email credentials.
Feedback is HTML-escaped, size-validated, capped at 500 in-memory records, and
limited to 20 submissions per minute per server process. Data resets on restart.

## Room security and deployment impact

The first participant requesting the Scrum Master role claims it if vacant.
Later participants cannot take it over. Reconnection requires a server-generated
secret retained in sessionStorage, never a display-name match alone. Tokens are
not broadcast. Existing clients should refresh after deployment. A server restart
still clears rooms; these remain invitation-by-room-name sessions, without full
account authentication or private-room passwords.

Only explicitly listed browser assets are served. Server source, dependencies,
configuration and backup files are not public. Hidden votes are redacted on the
wire; only the room master can reveal/reset votes or update the story, and
notifications cannot cross rooms. Socket payloads and event rates are bounded.
For larger/public deployments, supplement per-process limits with edge connection
and abuse controls.

## Validation

Run `npm test` and `npm audit` inside `scrum-game/`. Nine tests cover HTTP exposure,
feedback authentication and XSS, malformed events, session impersonation, role
ownership, hidden votes, room isolation, analytics consent/privacy, and email
composition. SMTP delivery requires the deployment's existing credentials and
was not exercised by local tests. Dependencies were updated using npm's security
advisories, including Nodemailer 10; `npm ci` makes deployment use the lockfile.
