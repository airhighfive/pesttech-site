// POST /api/request: the plain request form on /book posts here. It's a Cloudflare Pages Function, so it
// deploys with the site.
//
// Spam checks (no cookies, captcha or tracking), cheapest first:
//   1. The honeypot `website` field is filled in: pretend it worked and drop it.
//   2. `ts` (page-load time, set by the form's one line of JS) is under 3 seconds old. A missing `ts` is
//      fine, so no-JS browsers and agents still get through.
//   3. There's a link anywhere in the form, or the phone isn't a 10-digit US number.
//   4. One IP has already sent 5 requests this hour (needs the RATE_LIMIT KV binding).
// Checks 2–4 answer with the error page saying what to fix, not a fake "thanks", because a person can trip them.
//
// A request that passes becomes a GorillaDesk customer with status "lead" plus a note holding what they wrote.
// Then comes a Slack message, then a 303 to /book/thanks. If GorillaDesk fails, the Slack message says so and
// someone adds the lead by hand. The person only gets the error page if both fail.
//
// Environment (Pages → Settings): GORILLADESK_API_KEY and SLACK_WEBHOOK_URL (secrets) and the RATE_LIMIT KV
// binding. Optional: GORILLADESK_PHONE_TYPE_ID skips the phone-type lookup, and GORILLADESK_API_URL points at a
// mock server for local testing.

const MIN_FILL_MS = 3_000;
const RATE_MAX = 5; // accepted requests per IP...
const RATE_WINDOW_S = 60 * 60; // ...per hour
const MAX_BODY_BYTES = 16 * 1024;
const MAX_LENGTH = { name: 100, phone: 40, address: 200, issue: 2_000, preferred_date: 40 };
const GORILLADESK_API = "https://api.gorilladesk.com/v1";
const GORILLADESK_TIMEOUT_MS = 8_000;
const SLACK_TIMEOUT_MS = 5_000;
const THANKS_PAGE = "/book/thanks";
const ERROR_PAGE = "/book/error"; // src/book-error.njk
const PHONE = { display: "(423) 771-9393", tel: "+14237719393" }; // only for the fallback error page

const FAILED = "Something went wrong on our end, and your request didn't go through.";

export async function onRequest(context) {
  const { method } = context.request;
  if (method === "POST") return handleRequest(context);
  // Someone opened the endpoint itself (a refresh or a bookmark): send them to the form.
  if (method === "GET" || method === "HEAD") return redirect("/book#request");
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD, POST" } });
}

async function handleRequest(context) {
  const { request, env } = context;

  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    return errorPage(context, 413, "That's more than the form can take. Please shorten it and send it again.");
  }
  let form;
  try {
    form = await request.formData();
  } catch {
    return errorPage(context, 400, "We couldn't read that form. Please go back and send it again.");
  }
  const field = (name) => clean(form.get(name), name === "issue");

  // 1. People never see the honeypot, so anything in it came from a bot.
  if (field("website")) {
    console.log("booking: dropped, honeypot filled");
    return redirect(THANKS_PAGE);
  }

  // 2. Time gate. `ts` is the visitor's clock and Date.now() is ours. If theirs runs ahead, the gap comes out
  //    negative, and that counts as a pass rather than shutting them out.
  const loadedAt = Number(field("ts"));
  const elapsed = Date.now() - loadedAt;
  if (field("ts") && Number.isFinite(loadedAt) && elapsed >= 0 && elapsed < MIN_FILL_MS) {
    console.log(`booking: refused, sent ${elapsed} ms after page load`);
    return errorPage(context, 400, "That was quick. Please wait a few seconds, then send it again.");
  }

  const req = Object.fromEntries(Object.keys(MAX_LENGTH).map((name) => [name, field(name)]));
  const missing = [
    ["name", "your name"],
    ["phone", "a phone number"],
    ["address", "the service address"],
    ["issue", "what's bugging you"],
  ].filter(([name]) => !req[name]);
  if (missing.length) {
    return errorPage(context, 400, `Please fill in ${listify(missing.map(([, label]) => label))}, then send it again.`);
  }
  if (Object.entries(MAX_LENGTH).some(([name, max]) => req[name].length > max)) {
    return errorPage(context, 400, "That's more than the form can take. Please shorten it and send it again.");
  }

  // 3. Links and phone numbers.
  const link = findLink(Object.values(req).join("\n"));
  if (link) {
    console.log("booking: refused, link in the form");
    return errorPage(context, 400, `Please take out the web address (${link}) and send it again. We don't accept links, to keep out spam.`);
  }
  const phone = parsePhone(req.phone);
  if (!phone) {
    console.log("booking: refused, phone didn't parse");
    return errorPage(context, 400, "We couldn't read that phone number. Please use a 10-digit US number, like 423-555-0123.");
  }

  if (!env.GORILLADESK_API_KEY && !env.SLACK_WEBHOOK_URL) {
    console.error("booking: GORILLADESK_API_KEY and SLACK_WEBHOOK_URL are both unset, so the request has nowhere to go");
    return errorPage(context, 503, FAILED);
  }

  // 4. Per-IP rate limit, counted only for requests that got this far.
  const retryAfter = await rateLimit(env, request.headers.get("CF-Connecting-IP") || "unknown");
  if (retryAfter) {
    console.log("booking: refused, rate limit");
    return errorPage(context, 429, "We've already had several requests from your connection this hour. Please call or text us instead.", {
      "Retry-After": String(retryAfter),
    });
  }

  const lead = { ...req, phone, host: new URL(request.url).host };
  const delivery = deliver(env, lead);
  // Without this, a closed tab or a second click could cancel the request halfway (a lead with no Slack message).
  context.waitUntil?.(delivery);
  const { gorilladesk, slack } = await delivery;
  if (gorilladesk.ok || slack.ok) return redirect(THANKS_PAGE);
  return errorPage(context, 502, FAILED);
}

// Never throws: each side reports { ok, ... } so one failing doesn't stop the other.
async function deliver(env, lead) {
  let gorilladesk = { ok: false, error: "no API key set" };
  if (env.GORILLADESK_API_KEY) {
    try {
      gorilladesk = { ok: true, ...(await createLead(env, lead)) };
    } catch (err) {
      console.error(`booking: GorillaDesk lead not created: ${err.message}`);
      gorilladesk = { ok: false, error: err.message };
    }
  }

  let slack = { ok: false };
  if (env.SLACK_WEBHOOK_URL) {
    try {
      const res = await fetch(env.SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: slackText(lead, gorilladesk), unfurl_links: false, unfurl_media: false }),
        signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      slack = { ok: true };
    } catch (err) {
      console.error(`booking: Slack message not sent: ${err.message}`);
    }
  }
  return { gorilladesk, slack };
}

// GorillaDesk v1 has no separate lead endpoint: a lead is a customer with status "lead". POST /customers needs a
// first name and a location (street, city, state, ZIP). The request itself goes in a customer note.
async function createLead(env, lead) {
  const { first, last } = splitName(lead.name);
  let phoneType = null;
  try {
    phoneType = await phoneTypeId(env);
  } catch (err) {
    console.error(`booking: phone type lookup failed, so the lead has no phone (the note has it): ${err.message}`);
  }
  const created = await callGorillaDesk(env, "/customers", {
    method: "POST",
    json: {
      first_name: first,
      ...(last && { last_name: last }),
      status: "lead",
      ...(phoneType && { phones: [{ phone: lead.phone.dashed, type: phoneType }] }),
      location: parseAddress(lead.address),
    },
  });
  const id = created?.data?.id;
  if (!id) throw new Error("POST /customers returned no customer id");

  const note = new FormData();
  note.append("content", noteText(lead));
  const path = `/customers/${encodeURIComponent(id)}`;
  // The create call only returns the id. Fetching the customer gets the link for Slack.
  const [noteResult, customer] = await Promise.allSettled([
    callGorillaDesk(env, `${path}/notes`, { method: "POST", body: note }),
    callGorillaDesk(env, path),
  ]);
  if (noteResult.status === "rejected") console.error(`booking: GorillaDesk note not saved: ${noteResult.reason.message}`);
  const url = customer.value?.data?.profile_url;
  return { url: /^https:\/\/[^\s|<>]+$/.test(url) ? url : null, noteSaved: noteResult.status === "fulfilled" };
}

async function callGorillaDesk(env, path, { method = "GET", json, body } = {}) {
  const headers = { Authorization: `Bearer ${env.GORILLADESK_API_KEY}`, Accept: "application/json" };
  if (json) headers["Content-Type"] = "application/json";
  const base = (env.GORILLADESK_API_URL || GORILLADESK_API).replace(/\/+$/, "");
  const res = await fetch(base + path, {
    method,
    headers,
    body: json ? JSON.stringify(json) : body,
    signal: AbortSignal.timeout(GORILLADESK_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // GorillaDesk puts a summary in `message` and, for validation errors, the fields in `error`/`errors`.
    const fields = data?.error ?? data?.errors;
    const detail = [typeof data?.message === "string" ? data.message : "", fields ? JSON.stringify(fields) : ""]
      .filter(Boolean)
      .join(" ")
      .slice(0, 300);
    throw new Error(`${method} ${path} returned HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return data;
}

// Phone numbers need a phone type id. Ours are texted, so prefer a mobile type. Cached for the life of the isolate.
const phoneTypes = new Map();
async function phoneTypeId(env) {
  if (env.GORILLADESK_PHONE_TYPE_ID) return env.GORILLADESK_PHONE_TYPE_ID;
  const key = `${env.GORILLADESK_API_URL}|${env.GORILLADESK_API_KEY}`;
  if (!phoneTypes.has(key)) {
    const types = (await callGorillaDesk(env, "/phone-types?limit=100"))?.data?.filter((t) => t.state !== "deleted") ?? [];
    const pick = types.find((t) => /mobile|cell/i.test(t.name)) ?? types.find((t) => t.is_default) ?? types[0];
    if (!pick?.id) throw new Error("GET /phone-types returned no phone types");
    phoneTypes.set(key, pick.id);
  }
  return phoneTypes.get(key);
}

// Fixed window per IP in KV. KV is eventually consistent, so this is a best-effort brake for floods, not an exact
// count. IPs are stored hashed and expire with the window. A missing binding or a KV error lets the request through.
// Returns 0 to allow, or the seconds until this IP may send again.
async function rateLimit(env, ip) {
  if (!env.RATE_LIMIT) {
    console.warn("booking: no RATE_LIMIT KV binding, so there's no per-IP limit");
    return 0;
  }
  try {
    const key = `ip:${await sha256(ipBucket(ip))}`;
    const now = Math.floor(Date.now() / 1000);
    const hit = await env.RATE_LIMIT.get(key, "json");
    const current = hit && hit.reset > now ? hit : { count: 0, reset: now + RATE_WINDOW_S };
    if (current.count >= RATE_MAX) return current.reset - now;
    await env.RATE_LIMIT.put(key, JSON.stringify({ count: current.count + 1, reset: current.reset }), {
      expirationTtl: Math.max(60, current.reset - now), // KV's minimum TTL is 60 seconds
    });
    return 0;
  } catch (err) {
    console.error(`booking: rate limit check failed, letting the request through: ${err.message}`);
    return 0;
  }
}

// An IPv6 connection usually gets a whole /64 to itself, so count by that prefix, not the full address.
export function ipBucket(ip) {
  if (!ip.includes(":") || ip.includes(".")) return ip.slice(ip.lastIndexOf(":") + 1); // IPv4, maybe as ::ffff:a.b.c.d
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

function slackText(lead, gd) {
  const lines = [
    `New request from ${lead.host}/book`,
    `*${slackEscape(lead.name)}* · ${lead.phone.display}`,
    slackEscape(lead.address),
    ...lead.issue.split("\n").map((line) => `> ${slackEscape(line)}`),
  ];
  if (lead.preferred_date) lines.push(`Preferred date: ${slackEscape(describeDate(lead.preferred_date))}`);
  if (!gd.ok) {
    lines.push(`:warning: Not in GorillaDesk (${slackEscape(gd.error)}). Add it by hand.`);
  } else {
    lines.push(gd.url ? `<${gd.url}|Open the lead in GorillaDesk>` : "Added to GorillaDesk as a lead.");
    if (!gd.noteSaved) lines.push(":warning: The note with their request didn't save in GorillaDesk.");
  }
  return lines.join("\n");
}

function noteText(lead) {
  return [
    `Request from the website form (${lead.host}/book):`,
    lead.issue,
    "",
    `Preferred date: ${lead.preferred_date ? describeDate(lead.preferred_date) : "none given"}`,
    `Phone: ${lead.phone.display}`,
    `Address as typed: ${lead.address}`,
  ].join("\n");
}

// The error page is src/book-error.njk, so it has the site's header and footer. The reason goes between its
// <!--reason--> comments. If the page can't be fetched, a bare version that still links the stylesheet stands in.
async function errorPage({ request, env }, status, message, headers = {}) {
  let html = null;
  try {
    const res = await env.ASSETS.fetch(new URL(ERROR_PAGE, request.url));
    if (res.ok) html = (await res.text()).replace(/<!--reason-->[\s\S]*?<!--\/reason-->/, () => escapeHtml(message));
  } catch {
    // No ASSETS binding (unit tests) or the fetch failed: use the fallback below.
  }
  html ??= `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Request Not Sent | Pest Tech Chattanooga</title>
<link rel="stylesheet" href="/assets/css/site.css">
</head>
<body>
<div class="sheet">
  <main>
    <h1>Request not sent</h1>
    <p class="lede">${escapeHtml(message)}</p>
    <p class="center"><a href="/book#request">← Back to the request form</a></p>
    <p class="center">Or call or text <a class="phone-inline" href="tel:${PHONE.tel}">${PHONE.display}</a> and we'll take it from there.</p>
  </main>
</div>
</body>
</html>
`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", ...headers },
  });
}

const redirect = (location) => new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });

// ---- Parsing helpers (exported for the tests) ----

// A 10-digit US number, with an optional leading 1 and an optional extension. Only digits and phone punctuation
// may appear, so "call me at 423…" doesn't parse.
export function parsePhone(raw) {
  const [, main, ext] = /^(.*?)(?:\s*(?:ext\.?|extension|x|#)\s*(\d{1,6}))?$/i.exec(String(raw).trim());
  if (!/^[\d\s().+\-/]+$/.test(main)) return null;
  let digits = main.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  // Area code and exchange can't start with 0 or 1, and N11 codes (411, 911) aren't area codes.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits) || /^[2-9]11/.test(digits)) return null;
  const [area, exchange, line] = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)];
  return { dashed: `${area}-${exchange}-${line}`, display: `(${area}) ${exchange}-${line}${ext ? ` x${ext}` : ""}` };
}

const EMAIL = /[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi;
const LINKS = [
  /\b(?:https?|ftp):\/\/\S*/i,
  /\bwww\d{0,3}\.\S*/i,
  /<\s*a\b[^>]*>?/i,
  /\[\/?url\b[^\]]*\]?/i,
  // A bare domain. The TLD has to be lowercase, so a missing space ("in the garage.Online reviews") doesn't count.
  /\b[A-Za-z0-9][A-Za-z0-9-]*\.(?:com|net|org|info|biz|io|ru|cn|xyz|top|site|online|shop|store|club|click|link|icu|ly)\b\S*/,
];
// Returns the first link-like text (to quote back in the error), or null. Email addresses are allowed.
export function findLink(text) {
  const withoutEmails = text.replace(EMAIL, " ");
  for (const pattern of LINKS) {
    const match = pattern.exec(withoutEmails);
    if (match) return match[0].slice(0, 60);
  }
  return null;
}

const STATES = { tn: "TN", tenn: "TN", tennessee: "TN", ga: "GA", georgia: "GA", al: "AL", ala: "AL", alabama: "AL" };
const GEORGIA_TOWNS = /^(?:rossville|fort oglethorpe|ft\.? oglethorpe|ringgold|chickamauga|flintstone|la ?fayette|trenton|rising fawn)$/i;
const UNIT = /^(?:apt|apartment|unit|ste|suite|lot|bldg|building|fl|floor|rm|room|#)\b/i;

// The form has one address box; GorillaDesk wants street, city, state and ZIP. Best effort: peel a ZIP and a state
// off the end, take the last comma-separated part as the city, and fall back to Chattanooga, TN. The address as
// typed also goes in the note, so nothing is lost when this guesses wrong.
export function parseAddress(raw) {
  let rest = raw;
  let zip = "";
  let state = "";
  let city = "Chattanooga";
  const zipMatch = /[\s,]*\b(\d{5})(?:-\d{4})?$/.exec(rest);
  if (zipMatch && zipMatch.index > 0) {
    zip = zipMatch[1];
    rest = rest.slice(0, zipMatch.index);
  }
  const stateMatch = /[\s,]+(tn|tenn|tennessee|ga|georgia|al|ala|alabama)\.?$/i.exec(rest);
  if (stateMatch) {
    state = STATES[stateMatch[1].toLowerCase()];
    rest = rest.slice(0, stateMatch.index);
  }
  const parts = rest.split(",").map((part) => part.trim()).filter(Boolean);
  const last = parts.at(-1);
  if (parts.length > 1 && /^[a-z][a-z .'-]*$/i.test(last) && !UNIT.test(last)) city = parts.pop();
  state ||= GEORGIA_TOWNS.test(city) ? "GA" : "TN";
  return { address_line_1: parts.join(", ") || raw, city, state, zip };
}

// The last word is the last name, keeping a suffix with it ("John Smith Jr." → "John", "Smith Jr.").
export function splitName(full) {
  const words = full.split(" ").filter(Boolean);
  if (words.length < 2) return { first: full, last: "" };
  const take = words.length > 2 && /^(?:jr|sr|ii|iii|iv)\.?$/i.test(words.at(-1)) ? 2 : 1;
  return { first: words.slice(0, -take).join(" "), last: words.slice(-take).join(" ") };
}

// "2026-10-21" (what a date input sends) becomes "Wed, Oct 21, 2026". Anything else passes through as typed.
function describeDate(raw) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return raw;
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (date.getUTCDate() !== +m[3]) return raw;
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// Strips control characters and squeezes whitespace. Only `issue` keeps its line breaks.
function clean(value, multiline) {
  if (typeof value !== "string") return "";
  const text = value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  const squeezed = multiline ? text.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n") : text.replace(/\s+/g, " ");
  return squeezed.trim();
}

function listify(items) {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Slack treats <…> as links and mentions (<!channel>), so escape them in anything the visitor typed.
const slackEscape = (text) => String(text).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
