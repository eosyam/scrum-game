# Analytics and security configuration

GA4 account and property: **Scrum Game**, account `413722757`, property `561102295`.
Web stream: `16223059049`, measurement ID `G-ECX1QTM93L`.
Site: https://scrum-game-ckpj.onrender.com/
Reporting time zone: Türkiye (UTC+03:00).

Google Analytics loads automatically with analytics cookie storage enabled.
There is no injected consent banner, preference button or analytics layout CSS.
Advertising storage, ad personalization and Google signals remain disabled.
Page views and the usage events below are configured; room identifiers, query
strings, fragments, referrers, usernames, votes, story titles, emails and
feedback are excluded from every payload. Nothing is sent from localhost. Enhanced measurement is disabled in this GA4 stream
to prevent automatic form, link and history events from sending room details.
Keep it disabled. Tests validate configuration and payload sanitization;
they do not prove live Google ingestion.

## Usage events

All events go through `window.track(name, params)` in `analytics.js`, which drops
unknown event names and any param/value not on that event's allowlist, and always
adds the sanitized `page_location`. Events fire from the acting user's own click,
never from broadcast receivers, so counts are not multiplied by room size.

| Event | Params | Fired when |
| --- | --- | --- |
| `join_room` | `role`: master / participant | Server confirms the join (once per session, not on reconnect) |
| `game_start` | none | Server confirms the user as Scrum Master |
| `join_error` | `reason`: room_full / room_limit / name_taken / other | Join rejected |
| `vote_cast` | none | First vote of a round by a user (never the value) |
| `votes_revealed` | `participant_bucket`: 1 / 2-4 / 5-9 / 10+ | Master reveals |
| `round_reset` | none | Master resets |
| `reaction_sent`, `nudge_sent`, `break_request`, `question_raised` | none | Clicked |
| `story_updated` | none | Master edits the story (once per round, never the text) |

### GA4 Admin steps (not doable from code)

- Register `role`, `reason` and `participant_bucket` as event-scoped custom dimensions.
- Mark `game_start` (and optionally `votes_revealed`) as key events.
- Raise event data retention from 2 to 14 months.
- Add an internal-traffic filter if the team tests against production.

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

Run `npm test` and `npm audit` inside `scrum-game/`. Thirteen tests cover HTTP exposure,
feedback authentication and XSS, malformed events, session impersonation, role
ownership, hidden votes, room isolation, analytics configuration/privacy, and email
composition. SMTP delivery requires the deployment's existing credentials and
was not exercised by local tests. Dependencies were updated using npm's security
advisories, including Nodemailer 10; `npm ci` makes deployment use the lockfile.
