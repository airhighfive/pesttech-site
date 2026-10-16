# Pest Tech site: open items

Everything here is either a `[Q]` from the Claude Design files (copy that wasn't verified, so it doesn't ship) or a gap the build ran into. Spec references are to `website-rebuild-spec_2.md`.

## Blocking launch

- Done 2026-10-15: **Online Booking add-on (spec Q6).** Dan turned it on in GorillaDesk (Addons → Online Booking), with only the two inspections bookable. /book and every service page show GorillaDesk's iframe (`booking.embedUrl` in `src/_data/site.js`) at a fixed 780px. GorillaDesk's optional `embed.js` resizer is left off (no JS outside the /book form), so the list of times scrolls inside the box.
  - Online bookings arrive as Pending jobs (Reports → Online Booking Report). One whose phone or email doesn't match a customer stays off the calendar until it's assigned to one, so check the report often (for a future SOP).
  - The widget requires an email address; the request form doesn't ask for one. The time list shows every 15-minute slot from 7:30 to 5:00, with taken ones greyed out.
- Done 2026-10-15: **booking endpoint (spec step 5).** `/api/request` (`functions/api/request.js`, see "Booking endpoint" in the README) is live on pages.dev, with both secrets and the `RATE_LIMIT` KV binding. Live tests posted to Slack (#new-channel) and created a GorillaDesk customer with status Lead, with its note. GorillaDesk refuses a blank ZIP, so /book has a required ZIP code box.
  - The test lead is deleted. GorillaDesk lead notifications are on for Dan and Shelby. The Slack link opens the lead on the web but not in the mobile app (fine).
  - Web leads arrive with no lead source (the API can't set one). A repeat customer comes in as a new lead; delete or merge it in GorillaDesk (for a future SOP).
  - The limit is 5 requests an hour per connection, and a whole office shares one connection. To reset it while testing, delete the `ip:` entry in the `pesttech-rate-limit` KV namespace.
- Done 2026-10-15 (Dan's answers):
  - Founded in 2015: on /about, in `site.js` (`founded`), the schema's `foundingDate`, and llms.txt.
  - No termite work in Georgia. Said on /termites (with a little dry shade at the Georgia Department of Agriculture), /service-area, the FAQ, and the Services blurb.
  - No public email anywhere on the site; customers call or text. The email field is gone from `site.js`, the footer, and the schema.
  - ZIP for 2301 Dodds Ave is 37407 (footer and schema).
  - /licensing-insurance uses Dan's wording plus TN Charter #4988 (from the old /insurance page, which now 301s here). The charter number is also in the footer.
  - The Nexa license covers web use.
  - New footer page: /weird-website ("why the weird website?").
  - Georgia licenses (pesticide contractor #101833, structural pest control company #100434) are in the schema's `hasCredential` and llms.txt, not shown on the pages.
  - /termites real estate answer: no "Dan reviews every report"; mentions Supra eKEY access for vacant homes.
  - "No account, no captcha" is gone from the caption under the booking box on every service page; /book still has it.

## Copy to verify (the yellow [Q] marks; not shipped)

All copy follows `../pest-tech-website-voice-guide.md`. Run its section 11 checklist before handing a page to Dan; its section 12 lists the open questions.

- [ ] Termites: NPMA-33 letter price. The old site says "usually $160"; it's left off.
- [ ] Mosquitoes: 2026 In2Care season price. The old site says "$500-1000"; it's left off.
- [ ] Bed bugs: the old page's "$100 deposit to inspect" sentence is left off (an unpublished price). Also confirm the "90-day warranty" line is still true.
- [ ] Privacy policy (ported as-is) still mentions an online portal that collects email, and cookies. The new site sets no cookies and the form doesn't ask for email, but the GorillaDesk booking widget does ask for email. Worth a refresh.
- Done 2026-10-14: FAQ contracts and response-time answers are Dan's wording; Team shows names and photos only, no titles.

## Notes for the About and service-page pass (Dan, 2026-10-14)

2026-10-15: all seven service pages and the About page are drafted from these notes and six recorded inspections in Plaud (Aug and Sep 2026). Only patterns and Dan's own explanations were used, nothing about any customer.

Answered by Dan on 2026-10-15 and now on the site:

- Regular Service: 100-day commitment confirmed. A start-up charge is mentioned only as a maybe ("depending on the house"), with no amount.
- Termites: one-year commitment; as an add-on to Regular Service, typically $25 to $35 a month after a $500 to $1,000 setup (matches the handbook's Pricing Guidelines).
- Mosquitos: $100 to $150 a month published. Regular Service is $40 to $60 a month everywhere (Dan raised both ranges 2026-10-16).
- Dan's calls, 2026-10-16: spell it "mosquitos" everywhere in our copy (reviews stay verbatim), and the "!" on /service-area stays (an approved exception to the voice guide).
- Kids and pets: "about an hour" inside after an outside treatment, on /regular-service and the FAQ.
- Bed bugs: the page is aimed at single-family, owner-occupied homes. The 90-day warranty is for single-family detached homes only, not apartments or one side of a duplex. Apartments only for existing property-manager customers.

Still open:

- Hemlock (Dan, 2026-10-15): headings keep "Corrective"; the body pairs the two terms, "curative (corrective)" and "corrective (curative)", since people search both.
- About: drafted 2026-10-15 in third person, like the old page (voice guide Q19). Founding year 2015 confirmed.
- Done 2026-10-16: About photo (Dan with the truck and hound, from the old site), the summer 2026 rafting photo on /team, the $200 bed bug deposit note in place of the booking box on /bed-bugs, and a background for wide screens. Photo originals are in `../photos`. The swooping lines were replaced the same day by the Tennessee River as a gap in the dots, fading slowly downstream, built from USGS data by `scripts/make-river-svg.mjs`. After Dan's first look it was made stronger (a pale band, 70% at rest) and set at a fixed scale, so a wider window shows more river: Williams Island just left of the page, downtown hidden behind it. Dan to review on pages.dev.
- [ ] Home page line "A constant pursuit of technical knowledge, a deep love for our city..." isn't used anywhere yet (voice guide Q20). Keep it somewhere?

- **Everywhere:** never "quarterly" (say seasonal); "cockroaches," not "roaches," in copy (the /roaches URL stays for search); no "the one most people choose" style lines.
- **Regular Service:** general maintenance, focused on the outside of the house, heading off problems before they get inside, and changing with the seasons. Most common pests: ants, cockroaches, wasps. Leave spiders off; yard webs aren't covered. Dan can pull Plaud transcripts of how he explains it; the Notion "Talk Pattern Extraction" page has more.
- **German cockroaches:** do much more work up front to clear the infestation quickly, rather than knocking a few back every month and never finishing. No long-term agreement required.
- **Termites:** protection on its own or as an add-on to Regular Service, treatment of active infestations, inspections and NPMA-33 letters for closings. The FAQ now sends people to an inspection instead of quoting prices; decide whether the termites page keeps the $30/month and $500 to $1,000 numbers.
- **Mosquitoes:** conventional barrier treatments, plus alternative control for difficult or sensitive situations.
- **Rodents:** two parts. Short term: clear out what's in the house, with traps or bait depending on the situation. Long term: keep them from coming back.
- **Bed bugs:** listed below rodents on purpose; not a service we're pushing, and it may come off the site. Say we use residual treatments, including Apprehend, and that we don't do heat treatments (when heat is the right answer, Dan refers people elsewhere; don't name the company).
- **Hemlock woolly adelgid:** curative and preventive treatments, from a tree or two in a yard to tracts of 40 to 100+ acres. Use acres, not hectares. The ported copy says treatment must be done "in a safe and effective way"; reword (hard rule 2).
- **About:** the ported line "keep it safe and pest-free" breaks hard rules 2 and 8; the voice guide's About brief says how to rewrite it.

## Photos

- Team photos: done 2026-10-15 from Dan's contact-sheet mapping. Names use the Employee Directory spellings (Donavon, Candace). Dan to double-check the page.
- [ ] **Home hero (optional).** Set `images.homeHero` in `site.js`; the figure stays hidden until set.
- [ ] **30-minute service-area map** (handoff: Dan is producing it). Replace `design/uploads/Service Area Simple.jpg` and run `npm run images`.
- [ ] Favicon.
- Not used on purpose: `design/uploads/pasted-1789440901681-0.png` is a GorillaDesk map of customer locations. Don't publish it.

## Reviews

- [ ] Seed /reviews with the best 2022–2026 Google reviews (spec Q2): add them at the top of `src/_data/reviews.js`.
- [ ] Google Business Profile, Facebook, Nextdoor, LinkedIn URLs → `sameAs` and `googleReviewsUrl` in `site.js`.

## Before launch: found while archiving the old site (2026-10-15)

The archive is in `../squarespace-archive-2026-10-15/` (open its `index.html`).

- Done: `/home`, `/blog`, and `/blog/*` now 301 to `/`. The 2020 tick post is retired (Dan, 2026-10-15); it's still in the archive.
- Done: `/referrals` is a small page (no form), since the postcards mailed to new customers point there. The referral line on the service pages links to it.
- [ ] Save what a crawl can't see (details in the archive's README): Squarespace's export, URL mappings, code injection, any stored form submissions, and a screenshot of every row in Namecheap's Advanced DNS.
- [ ] DNS is hosted at Namecheap, and email is Namecheap Private Email. Cloudflare Pages needs the domain's nameservers on Cloudflare to serve the bare pesttechchattanooga.com, so going live means moving nameservers and recreating the email records exactly (MX, SPF, DKIM, autodiscover, DMARC; all in the archive's `dns-records.txt`).
- [ ] There are two DMARC records, which mail servers treat as none. Merge them into one (wording in `dns-records.txt`).

## Launch (spec sequence 6–8)

- Done 2026-10-15: private repo `airhighfive/pesttech-site` and the Cloudflare Pages project `pesttech-site`. Every push to `main` deploys to https://pesttech-site.pages.dev. If an extra *Worker* named `pesttech-site` is still in Workers & Pages (made by mistake before the Pages project), delete it.
- [ ] Dan reviews the pages.dev preview end to end. `_headers` keeps pages.dev out of search results.
- [ ] DNS flip with SPF/DKIM/DMARC intact. Verify redirects and GBP links. Keep Squarespace paid until the 301s show up in Search Console.
