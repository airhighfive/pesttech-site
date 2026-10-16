# pesttechchattanooga.com

Eleventy build of the 2026 "Web 1.0" redesign. Plain HTML and one CSS file, with no JavaScript except the timestamp on the /book form. It's built from:

- `../website-rebuild-spec_2.md`: URLs, redirects, schema, build requirements
- `../Pest Tech — Design Handoff for Claude Code.md` and `../design/`: the approved Claude Design files
- `../pest-tech-website-voice-guide.md`: voice, tone, and what the copy is allowed to say (no em or en dashes, no exclamation points, no safety claims). Every copy change follows it.

Open items are in [TODO.md](TODO.md).

## Commands

```
npm install
npm start          # preview at http://localhost:8080
npm run build      # writes _site/
npm run images     # re-make web images from ../design/uploads
npm test           # booking endpoint tests (GorillaDesk and Slack are mocked)
```

## Where things live

| To change… | Edit |
|---|---|
| Phone, hours, addresses, charter number, booking embed URL, hero/About photos (no email: Dan doesn't want one listed) | `src/_data/site.js` |
| Reviews (add new ones at the top) | `src/_data/reviews.js` |
| Team names, roles, photos | `src/_data/team.js` |
| FAQ questions and answers (page and schema) | `src/_data/faq.js` |
| Service names and blurbs (Services page, home, llms.txt) | `src/_data/services.js` |
| A service page's copy | `src/services/<slug>.njk` |
| Look and feel | `src/assets/css/site.css` |
| Header, nav, footer | `src/_includes/base.njk` |
| Redirects | `src/_redirects` |
| What the request form does when it's sent (spam rules, GorillaDesk, Slack) | `functions/api/request.js` |
| The page shown when a request can't be sent | `src/book-error.njk` |

## How it fits together

- **URLs match the Squarespace site exactly.** Each page is written as `/name.html`, which Cloudflare Pages serves at `/name`. The local preview does the same.
- **Redirects.** `src/_redirects` sends the 26 old testimonial pages to /reviews, /calendar to home, and the old /insurance page to /licensing-insurance. Every other URL is unchanged.
- **Schema.** Every page carries LocalBusiness JSON-LD (`src/_data/schema.js`). Service pages add a Service block, and /faq adds FAQPage, built from the same list the page shows. schema.org has no PestControl type, so the business uses HomeAndConstructionBusiness.
- **Crawlers.** The site generates `sitemap.xml`, `robots.txt` (AI crawlers welcome) and `llms.txt`.
- **Images.** The originals in `../design/uploads` and `../photos` stay out of the repo. `npm run images` writes web copies to `src/assets/img/`, and those get committed.
- **Background river.** On screens 900px and wider, the Tennessee River (Moccasin Bend on the left, the run to Chickamauga Dam on the right) shows as a gap in the dots and fades slowly downstream. `scripts/make-river-svg.mjs` builds `river-west.svg` and `river-east.svg` from USGS hydrography data (public domain); the animation is in `site.css`.
- **Booking.** The /book form posts to `/api/request` (see below). A successful request lands on `/book/thanks`.

## Booking endpoint

`functions/api/request.js` is a Cloudflare Pages Function, so it deploys with the site and answers at `/api/request`.

- **Spam checks, with no cookies or captcha.** A filled-in honeypot gets a fake "thanks" and goes nowhere. These get the error page saying what to fix, since a person can trip them too: a send under 3 seconds after the page loaded, a link anywhere in the form, or a phone that isn't a 10-digit US number. A missing `ts` is fine. After that, each IP gets 5 requests an hour.
- **A good request** becomes a GorillaDesk customer with status `lead`, plus a customer note with what they wrote. Then it posts to Slack with a link to the lead and redirects to /book/thanks. If GorillaDesk fails, the Slack message says to add the lead by hand. Only if GorillaDesk and Slack both fail does the visitor get the error page, which links back to the form and gives the phone number.
- **Settings** (Pages → Settings, never in the repo): the secrets `GORILLADESK_API_KEY` and `SLACK_WEBHOOK_URL`, and a KV namespace bound as `RATE_LIMIT`. Without the binding there's no per-IP limit. Optional: `GORILLADESK_PHONE_TYPE_ID` skips looking up the phone type on each cold start.
- **Testing.** `npm test` runs it against mocked GorillaDesk and Slack. `npm start` doesn't run functions. To run it in Cloudflare's runtime, run `npm run build`, then `npx wrangler pages dev _site --kv RATE_LIMIT`, with test values in a `.dev.vars` file (gitignored). Set `GORILLADESK_API_URL` to aim it at a mock server instead of the real API.

## Deploy (Cloudflare Pages)

The private repo is `airhighfive/pesttech-site`. Every push to `main` builds and deploys the Pages project `pesttech-site` to https://pesttech-site.pages.dev, so a change isn't live until it's committed and pushed.

- Build command: `npm run build`
- Output directory: `_site`
- Environment variable: `NODE_VERSION=22`
- Booking endpoint: the two secrets and the `RATE_LIMIT` KV binding above
- `_headers` marks every `*.pages.dev` preview `noindex`.
