# AnalyzeMySite Design Lock

FINAL APPROVED DESIGN:
- Homepage/front page uses the uploaded AI image hero card design.
- Analyze/loading page can keep its analysis visual separately.
- Crimson / black / white theme.
- AnalyzeMySite branding.

Important clarification from admin:
- The front page image/design was fine.
- The confusion/problem was about the orb/visual on the Analyze Website page, not the homepage.

Rules:
- Do not remove or replace the homepage image design unless admin explicitly says so.
- Do not switch to old homepage orb-only design unless admin explicitly says "redesign" or asks for that exact version.
- Future changes must stay inside this exact design.

## Anti-fallback guard

`npm run build` now runs `scripts/guard-design.js`.
If old design classes/tokens are reintroduced, the build fails so old layouts cannot silently deploy again.
