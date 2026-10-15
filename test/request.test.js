// Tests for functions/api/request.js. GorillaDesk and Slack are mocked: nothing here leaves the machine.
// Run with `npm test`.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { onRequest, parsePhone, findLink, parseAddress, splitName, ipBucket } from "../functions/api/request.js";

const GD = "https://api.gorilladesk.test/v1";
const SLACK = "https://hooks.slack.test/services/T000/B000/XXXX";
const PROFILE = "https://v3.gorilladesk.com/customers/5393";

// ---- Mocks ----

let calls; // every outgoing fetch: { method, url, headers, json, form }
let replies; // "METHOD url" → () => Response, overridable per test
let logs; // what the function wrote to the console
let keyCount = 0;
let env;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function fakeKV() {
  const store = new Map();
  return {
    store,
    async get(key, type) {
      const value = store.get(key);
      return value === undefined ? null : type === "json" ? JSON.parse(value) : value;
    },
    async put(key, value, options) {
      store.set(key, value);
      this.lastOptions = options;
    },
  };
}

const realFetch = globalThis.fetch;
const realConsole = { log: console.log, warn: console.warn, error: console.error };
beforeEach(() => {
  logs = [];
  for (const level of Object.keys(realConsole)) console[level] = (...args) => logs.push(args.join(" "));
  calls = [];
  replies = {
    [`GET ${GD}/phone-types?limit=100`]: () =>
      json({ data: [
        { id: "ptHome", name: "Home", is_default: true, state: "active" },
        { id: "ptOld", name: "Cell (old)", is_default: false, state: "deleted" },
        { id: "ptMobile", name: "Mobile", is_default: false, state: "active" },
      ] }),
    [`POST ${GD}/customers`]: () => json({ data: { id: "cus123" } }),
    [`POST ${GD}/customers/cus123/notes`]: () => json({ data: { id: "note1" } }),
    [`GET ${GD}/customers/cus123`]: () => json({ data: { id: "cus123", profile_url: PROFILE } }),
    [`POST ${SLACK}`]: () => new Response("ok"),
  };
  // A fresh API key per test, so the cached phone-type lookup starts over.
  env = { GORILLADESK_API_KEY: `test-key-${++keyCount}`, GORILLADESK_API_URL: GD, SLACK_WEBHOOK_URL: SLACK, RATE_LIMIT: fakeKV() };
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method || "GET";
    const call = { method, url, headers: new Headers(init.headers) };
    if (typeof init.body === "string") call.json = JSON.parse(init.body);
    if (init.body instanceof FormData) call.form = init.body;
    calls.push(call);
    const reply = replies[`${method} ${url}`];
    if (!reply) throw new Error(`unexpected fetch: ${method} ${url}`);
    return reply();
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
  Object.assign(console, realConsole);
});

const VALID = {
  name: "Jane Q Doe",
  phone: "(423) 555-0123",
  address: "123 Main St, Hixson, TN 37343",
  issue: "Roaches in the kitchen.\nSaw a few in the bathroom too.",
  preferred_date: "2026-10-21",
  website: "",
  ts: "", // set per call: a minute ago unless the test says otherwise
};

// Posts a form to the function the way the browser does, and waits for any waitUntil work.
async function post(fields = {}, { ip = "203.0.113.7", headers = {}, env: envOverrides = {}, method = "POST" } = {}) {
  const body = new URLSearchParams({ ...VALID, ts: String(Date.now() - 60_000), ...fields });
  for (const [key, value] of Object.entries(fields)) if (value === undefined) body.delete(key);
  const request = new Request("https://pesttechchattanooga.com/api/request", {
    method,
    body: method === "POST" ? body : undefined,
    headers: { "CF-Connecting-IP": ip, ...headers },
  });
  const pending = [];
  const res = await onRequest({ request, env: { ...env, ...envOverrides }, waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  return res;
}

const slackCalls = () => calls.filter((c) => c.url === SLACK);
const gdCalls = () => calls.filter((c) => c.url.startsWith(GD));
const accepted = (res) => res.status === 303 && res.headers.get("Location") === "/book/thanks";

// ---- The whole flow ----

test("a good request creates a GorillaDesk lead, posts to Slack and redirects to /book/thanks", async () => {
  const res = await post();
  assert.ok(accepted(res));

  const create = calls.find((c) => c.method === "POST" && c.url === `${GD}/customers`);
  assert.equal(create.headers.get("Authorization"), `Bearer ${env.GORILLADESK_API_KEY}`);
  assert.deepEqual(create.json, {
    first_name: "Jane Q",
    last_name: "Doe",
    status: "lead",
    phones: [{ phone: "423-555-0123", type: "ptMobile" }],
    location: { address_line_1: "123 Main St", city: "Hixson", state: "TN", zip: "37343" },
  });

  const note = calls.find((c) => c.url === `${GD}/customers/cus123/notes`).form.get("content");
  assert.match(note, /^Request from the website form \(pesttechchattanooga\.com\/book\):\nRoaches in the kitchen\.\nSaw a few/);
  assert.match(note, /Preferred date: Wed, Oct 21, 2026/);
  assert.match(note, /Phone: \(423\) 555-0123/);
  assert.match(note, /Address as typed: 123 Main St, Hixson, TN 37343/);

  const [slack] = slackCalls();
  assert.equal(slack.json.text, [
    "New request from pesttechchattanooga.com/book",
    "*Jane Q Doe* · (423) 555-0123",
    "123 Main St, Hixson, TN 37343",
    "> Roaches in the kitchen.",
    "> Saw a few in the bathroom too.",
    "Preferred date: Wed, Oct 21, 2026",
    `<${PROFILE}|Open the lead in GorillaDesk>`,
  ].join("\n"));
});

test("the optional date can be left out", async () => {
  const res = await post({ preferred_date: undefined });
  assert.ok(accepted(res));
  assert.doesNotMatch(slackCalls()[0].json.text, /Preferred date/);
  assert.match(calls.find((c) => c.form).form.get("content"), /Preferred date: none given/);
});

// ---- Spam rule: honeypot ----

test("honeypot filled: fake success, nothing sent, nothing counted", async () => {
  const res = await post({ website: "http://spam.example" });
  assert.ok(accepted(res));
  assert.equal(calls.length, 0);
  assert.equal(env.RATE_LIMIT.store.size, 0);
});

// ---- Spam rule: time gate ----

test("sent under 3 seconds after page load: error page, nothing sent", async () => {
  const res = await post({ ts: String(Date.now() - 1_000) });
  assert.equal(res.status, 400);
  assert.match(await res.text(), /wait a few seconds/);
  assert.equal(calls.length, 0);
});

test("sent just over 3 seconds after page load: accepted", async () => {
  assert.ok(accepted(await post({ ts: String(Date.now() - 3_100) })));
});

test("missing or empty ts is allowed (no-JS browsers and agents)", async () => {
  assert.ok(accepted(await post({ ts: undefined })));
  assert.ok(accepted(await post({ ts: "" })));
  assert.equal(slackCalls().length, 2);
});

test("ts in the future (visitor's clock runs fast) is allowed", async () => {
  assert.ok(accepted(await post({ ts: String(Date.now() + 120_000) })));
});

test("ts that isn't a number counts as missing", async () => {
  assert.ok(accepted(await post({ ts: "yesterday" })));
});

// ---- Spam rule: links ----

for (const [where, value] of [
  ["issue", "Cheap pills at https://spam.example/buy"],
  ["issue", "visit www.spam.example today"],
  ["issue", 'click <a href="x">here</a>'],
  ["issue", "[url=spam]deal[/url]"],
  ["issue", "found you on nextdoor.com"],
  ["name", "Jane spam-site.ru"],
  ["address", "123 Main St http://x.example"],
]) {
  test(`a link in ${where} gets the error page: ${value}`, async () => {
    const res = await post({ [where]: value });
    assert.equal(res.status, 400);
    assert.match(await res.text(), /take out the web address/);
    assert.equal(calls.length, 0);
  });
}

test("an email address in the issue isn't a link", async () => {
  assert.ok(accepted(await post({ issue: "Mice in the attic. Or email me at jane.doe@gmail.com" })));
});

// ---- Spam rule: phone ----

for (const phone of ["555-0123", "call me", "423-555-01234", "(023) 555-0123", "911-555-0123", "+44 20 7946 0958", "423-555-0123 or 423-555-0199"]) {
  test(`phone that doesn't parse gets the error page: ${phone}`, async () => {
    const res = await post({ phone });
    assert.equal(res.status, 400);
    assert.match(await res.text(), /couldn&#39;t read that phone number/);
    assert.equal(calls.length, 0);
  });
}

// ---- Spam rule: rate limit ----

test("rate limit: 5 requests an hour per IP, then 429 with Retry-After", async () => {
  for (let i = 0; i < 5; i++) assert.ok(accepted(await post()), `request ${i + 1}`);
  const res = await post();
  assert.equal(res.status, 429);
  const retryAfter = Number(res.headers.get("Retry-After"));
  assert.ok(retryAfter > 3500 && retryAfter <= 3600, `Retry-After ${retryAfter}`);
  assert.match(await res.text(), /call or text us instead/);
  assert.equal(slackCalls().length, 5);
  assert.ok(accepted(await post({}, { ip: "198.51.100.2" })), "another IP still gets through");
});

test("rate limit counts only requests that pass the other checks", async () => {
  for (let i = 0; i < 5; i++) assert.equal((await post({ phone: "nope" })).status, 400);
  for (let i = 0; i < 5; i++) assert.ok(accepted(await post()));
});

test("rate limit stores a hash of the IP, never the IP itself", async () => {
  await post({}, { ip: "203.0.113.7" });
  const [key] = env.RATE_LIMIT.store.keys();
  assert.match(key, /^ip:[0-9a-f]{64}$/);
  assert.ok(!key.includes("203.0.113.7"));
  assert.ok(env.RATE_LIMIT.lastOptions.expirationTtl >= 60);
});

test("rate limit counts IPv6 by /64, so rotating addresses in one block doesn't reset it", async () => {
  for (let i = 1; i <= 5; i++) assert.ok(accepted(await post({}, { ip: `2001:db8:abcd:12::${i}` })));
  assert.equal((await post({}, { ip: "2001:0db8:abcd:0012:ffff:1:2:3" })).status, 429);
  assert.ok(accepted(await post({}, { ip: "2001:db8:abcd:13::1" })), "the next /64 is separate");
});

test("ipBucket", () => {
  assert.equal(ipBucket("203.0.113.7"), "203.0.113.7");
  assert.equal(ipBucket("::ffff:203.0.113.7"), "203.0.113.7");
  assert.equal(ipBucket("2001:db8::1"), "2001:db8:0:0::/64");
  assert.equal(ipBucket("2001:0DB8:abcd:0012:0000:0000:0000:0001"), "2001:db8:abcd:12::/64");
  assert.equal(ipBucket("::1"), "0:0:0:0::/64");
  assert.equal(ipBucket("unknown"), "unknown");
});

test("a rate-limit window that has expired starts over", async () => {
  const key = (await post(), [...env.RATE_LIMIT.store.keys()][0]);
  env.RATE_LIMIT.store.set(key, JSON.stringify({ count: 5, reset: Math.floor(Date.now() / 1000) - 1 }));
  assert.ok(accepted(await post()));
  assert.equal(JSON.parse(env.RATE_LIMIT.store.get(key)).count, 1);
});

test("no RATE_LIMIT binding, or KV failing: requests still go through", async () => {
  assert.ok(accepted(await post({}, { env: { RATE_LIMIT: undefined } })));
  const broken = { get: async () => { throw new Error("KV down"); }, put: async () => {} };
  assert.ok(accepted(await post({}, { env: { RATE_LIMIT: broken } })));
});

// ---- Other input problems ----

test("missing fields get the error page listing them", async () => {
  const res = await post({ name: "  ", address: undefined });
  assert.equal(res.status, 400);
  assert.match(await res.text(), /Please fill in your name and the service address, then send it again\./);
  assert.equal(calls.length, 0);
});

test("over-long fields get the error page", async () => {
  const res = await post({ issue: "a".repeat(2_001) });
  assert.equal(res.status, 400);
  assert.match(await res.text(), /more than the form can take/);
});

test("a huge body is refused before it's read", async () => {
  const res = await post({}, { headers: { "Content-Length": "20000" } });
  assert.equal(res.status, 413);
});

test("a body that isn't a form gets the error page", async () => {
  const request = new Request("https://pesttechchattanooga.com/api/request", {
    method: "POST",
    body: JSON.stringify(VALID),
    headers: { "Content-Type": "application/json" },
  });
  const res = await onRequest({ request, env, waitUntil() {} });
  assert.equal(res.status, 400);
  assert.match(await res.text(), /couldn&#39;t read that form/);
});

// ---- When GorillaDesk or Slack fail ----

test("GorillaDesk rejects the lead: Slack says so, the visitor still gets thanks", async () => {
  replies[`POST ${GD}/customers`] = () => json({ error: null, message: "The zip field is required." }, 422);
  const res = await post({ address: "123 Main St" });
  assert.ok(accepted(res));
  assert.match(slackCalls()[0].json.text, /:warning: Not in GorillaDesk \(POST \/customers returned HTTP 422: The zip field is required\.\)\. Add it by hand\.$/);
});

test("GorillaDesk's field-level errors make it into the Slack warning", async () => {
  replies[`POST ${GD}/customers`] = () => json({ message: "Bad request", error: { "location.zip": ["required"] } }, 400);
  assert.ok(accepted(await post({ address: "123 Main St" })));
  assert.match(slackCalls()[0].json.text, /HTTP 400: Bad request \{"location\.zip":\["required"\]\}\)\. Add it by hand\./);
});

test("GorillaDesk unreachable: Slack says so, the visitor still gets thanks", async () => {
  replies[`GET ${GD}/phone-types?limit=100`] = () => { throw new TypeError("fetch failed"); };
  replies[`POST ${GD}/customers`] = () => { throw new TypeError("fetch failed"); };
  assert.ok(accepted(await post()));
  assert.match(slackCalls()[0].json.text, /:warning: Not in GorillaDesk \(fetch failed\)/);
});

test("phone type lookup fails: the lead is created without a phone (the note has it)", async () => {
  replies[`GET ${GD}/phone-types?limit=100`] = () => json({ message: "Forbidden" }, 403);
  assert.ok(accepted(await post()));
  const create = calls.find((c) => c.method === "POST" && c.url === `${GD}/customers`);
  assert.equal(create.json.phones, undefined);
  assert.match(calls.find((c) => c.form).form.get("content"), /Phone: \(423\) 555-0123/);
});

test("GORILLADESK_PHONE_TYPE_ID skips the lookup", async () => {
  assert.ok(accepted(await post({}, { env: { GORILLADESK_PHONE_TYPE_ID: "ptFixed" } })));
  assert.ok(!calls.some((c) => c.url.includes("/phone-types")));
  assert.equal(calls.find((c) => c.url === `${GD}/customers`).json.phones[0].type, "ptFixed");
});

test("the phone type lookup is cached between requests", async () => {
  await post();
  await post();
  assert.equal(calls.filter((c) => c.url.includes("/phone-types")).length, 1);
});

test("the note fails to save: still thanks, and Slack flags it", async () => {
  replies[`POST ${GD}/customers/cus123/notes`] = () => json({ message: "Server Error" }, 500);
  assert.ok(accepted(await post()));
  const text = slackCalls()[0].json.text;
  assert.match(text, /Open the lead in GorillaDesk/);
  assert.match(text, /:warning: The note with their request didn't save in GorillaDesk\./);
});

test("no profile link from GorillaDesk: Slack still says the lead was added", async () => {
  replies[`GET ${GD}/customers/cus123`] = () => json({ message: "Not Found" }, 404);
  assert.ok(accepted(await post()));
  assert.match(slackCalls()[0].json.text, /\nAdded to GorillaDesk as a lead\.$/);
});

test("Slack fails but the lead was created: thanks", async () => {
  replies[`POST ${SLACK}`] = () => new Response("invalid_token", { status: 403 });
  assert.ok(accepted(await post()));
});

test("both fail: 502 error page with a link back and the phone number", async () => {
  replies[`POST ${GD}/customers`] = () => json({ message: "Server Error" }, 500);
  replies[`POST ${SLACK}`] = () => new Response("no_service", { status: 404 });
  const res = await post();
  assert.equal(res.status, 502);
  assert.equal(res.headers.get("Content-Type"), "text/html; charset=utf-8");
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  const html = await res.text();
  assert.match(html, /Something went wrong on our end/);
  assert.match(html, /<a href="\/book#request">/);
  assert.match(html, /href="tel:\+14237719393">\(423\) 771-9393</);
  assert.match(html, /<link rel="stylesheet" href="\/assets\/css\/site\.css">/);
});

test("neither secret set: 503 error page and no calls", async () => {
  const res = await post({}, { env: { GORILLADESK_API_KEY: undefined, SLACK_WEBHOOK_URL: undefined } });
  assert.equal(res.status, 503);
  assert.equal(calls.length, 0);
});

test("Slack only (no GorillaDesk key yet): thanks, and Slack says to add it by hand", async () => {
  assert.ok(accepted(await post({}, { env: { GORILLADESK_API_KEY: undefined } })));
  assert.equal(gdCalls().length, 0);
  assert.match(slackCalls()[0].json.text, /:warning: Not in GorillaDesk \(no API key set\)\. Add it by hand\./);
});

test("GorillaDesk only (no Slack webhook): thanks", async () => {
  assert.ok(accepted(await post({}, { env: { SLACK_WEBHOOK_URL: undefined } })));
  assert.equal(slackCalls().length, 0);
});

// ---- Output safety ----

test("Slack mentions and links typed by the visitor are escaped", async () => {
  await post({ name: "<!channel> Bob", issue: "a & b <@U123>" });
  const text = slackCalls()[0].json.text;
  assert.match(text, /\*&lt;!channel&gt; Bob\*/);
  assert.match(text, /> a &amp; b &lt;@U123&gt;/);
  assert.ok(!text.includes("<!channel>"));
});

test("the error page comes from /book/error when the site's assets are there", async () => {
  const page = "<html><nav>site nav</nav><p class=\"lede\"><!--reason-->Default reason.<!--/reason--></p><footer>(423) 771-9393</footer></html>";
  let asked;
  const ASSETS = { fetch: async (url) => ((asked = String(url)), new Response(page)) };
  const res = await post({ issue: "see sp$&m.com <b>" }, { env: { ASSETS } });
  assert.equal(asked, "https://pesttechchattanooga.com/book/error");
  assert.equal(res.status, 400);
  const html = await res.text();
  assert.match(html, /<nav>site nav<\/nav>/);
  assert.ok(html.includes('<p class="lede">Please take out the web address (m.com) and send it again.'), html);
  assert.ok(!html.includes("Default reason"));
});

test("logs say what happened without the visitor's details", async () => {
  await post({ website: "filled" });
  await post({ ts: String(Date.now()) });
  await post({ phone: "nope" });
  await post();
  replies[`POST ${GD}/customers`] = () => json({ message: "Server Error" }, 500);
  await post();
  for (const reason of ["honeypot", "after page load", "phone didn't parse", "lead not created"]) {
    assert.ok(logs.some((line) => line.includes(reason)), reason);
  }
  for (const line of logs) assert.doesNotMatch(line, /Jane|555-0123|Main St|Roaches|203\.0\.113/, line);
});

test("visitor text in the error page is HTML-escaped, and $ patterns stay literal", async () => {
  const page = "<p><!--reason-->x<!--/reason--></p>";
  const ASSETS = { fetch: async () => new Response(page) };
  const res = await post({ issue: 'look: http://a.example/"><script>$&' }, { env: { ASSETS } });
  const html = await res.text();
  assert.ok(html.includes("http://a.example/&quot;&gt;&lt;script&gt;$&amp;"), html);
  assert.ok(!html.includes("<script>"));
});

// ---- Other methods ----

test("GET sends people to the form; other methods get 405", async () => {
  const get = await post({}, { method: "GET" });
  assert.equal(get.status, 303);
  assert.equal(get.headers.get("Location"), "/book#request");
  const put = await post({}, { method: "PUT" });
  assert.equal(put.status, 405);
  assert.equal(put.headers.get("Allow"), "GET, HEAD, POST");
});

// ---- Parsing helpers ----

test("parsePhone", () => {
  assert.deepEqual(parsePhone("(423) 555-0123"), { dashed: "423-555-0123", display: "(423) 555-0123" });
  assert.equal(parsePhone("423.555.0123").dashed, "423-555-0123");
  assert.equal(parsePhone("4235550123").dashed, "423-555-0123");
  assert.equal(parsePhone("+1 423-555-0123").dashed, "423-555-0123");
  assert.equal(parsePhone("1 (423) 555 0123").dashed, "423-555-0123");
  assert.equal(parsePhone("423-555-0123 ext. 12").display, "(423) 555-0123 x12");
  assert.equal(parsePhone("423-555-0123x7").display, "(423) 555-0123 x7");
  for (const bad of ["", "555-0123", "abc", "423-555-012a", "(123) 555-0123", "423-055-0123", "411-555-0123", "2423-555-0123"]) {
    assert.equal(parsePhone(bad), null, bad);
  }
});

test("findLink", () => {
  assert.equal(findLink("roaches in the kitchen"), null);
  assert.equal(findLink("123 Main St. Apt 4"), null);
  assert.equal(findLink("St. Elmo, near the incline"), null);
  assert.equal(findLink("they're in the garage.Online reviews said call you"), null);
  assert.equal(findLink("email me: bob.smith@yahoo.com"), null);
  assert.equal(findLink("Mr.Smith said e.g. 3.5 ft"), null);
  assert.equal(findLink("see https://x.example/a?b=c"), "https://x.example/a?b=c");
  assert.equal(findLink("WWW.SPAM.EXAMPLE"), "WWW.SPAM.EXAMPLE");
  assert.equal(findLink("best deals at Cheap-Pest.com!"), "Cheap-Pest.com!");
  assert.equal(findLink("bit.ly/abc"), "bit.ly/abc");
});

test("parseAddress", () => {
  const p = (raw) => parseAddress(raw);
  assert.deepEqual(p("123 Main St"), { address_line_1: "123 Main St", city: "Chattanooga", state: "TN", zip: "" });
  assert.deepEqual(p("123 Main St, Chattanooga, TN 37404"), { address_line_1: "123 Main St", city: "Chattanooga", state: "TN", zip: "37404" });
  assert.deepEqual(p("123 Main St, Chattanooga TN 37404-1234"), { address_line_1: "123 Main St", city: "Chattanooga", state: "TN", zip: "37404" });
  assert.deepEqual(p("123 Main St 37404"), { address_line_1: "123 Main St", city: "Chattanooga", state: "TN", zip: "37404" });
  assert.deepEqual(p("4 Oak Ave, Apt 2, Hixson, Tennessee"), { address_line_1: "4 Oak Ave, Apt 2", city: "Hixson", state: "TN", zip: "" });
  assert.deepEqual(p("4 Oak Ave, Unit B"), { address_line_1: "4 Oak Ave, Unit B", city: "Chattanooga", state: "TN", zip: "" });
  assert.deepEqual(p("9 Elm Dr, Rossville"), { address_line_1: "9 Elm Dr", city: "Rossville", state: "GA", zip: "" });
  assert.deepEqual(p("9 Elm Dr, Fort Oglethorpe, GA 30742"), { address_line_1: "9 Elm Dr", city: "Fort Oglethorpe", state: "GA", zip: "30742" });
  assert.deepEqual(p("37404"), { address_line_1: "37404", city: "Chattanooga", state: "TN", zip: "" });
  // Pasted from a map, or typed loosely.
  const dodds = { address_line_1: "2301 Dodds Ave", city: "Chattanooga", state: "TN", zip: "37407" };
  assert.deepEqual(p("2301 Dodds Ave, Chattanooga, TN 37407, USA"), dodds);
  assert.deepEqual(p("2301 Dodds Ave, Chattanooga, TN 37407, United States"), dodds);
  assert.deepEqual(p("2301 Dodds Ave, Chattanooga, TN 37407."), dodds);
  assert.deepEqual(p("2301 Dodds Ave, Chattanooga 37407 TN"), dodds);
  assert.deepEqual(p("2301 Dodds Ave, Chattanooga, Tennessee, 37407"), dodds);
  // The house number isn't the ZIP; the state comes from the ZIP when it isn't typed.
  assert.deepEqual(p("10520 Hixson Pike"), { address_line_1: "10520 Hixson Pike", city: "Chattanooga", state: "TN", zip: "" });
  assert.deepEqual(p("10520 Hixson Pike, Hixson 37343"), { address_line_1: "10520 Hixson Pike", city: "Hixson", state: "TN", zip: "37343" });
  assert.deepEqual(p("9 Elm Dr, Ringgold 30736"), { address_line_1: "9 Elm Dr", city: "Ringgold", state: "GA", zip: "30736" });
  assert.deepEqual(p("9 Elm Dr 30741"), { address_line_1: "9 Elm Dr", city: "Chattanooga", state: "GA", zip: "30741" });
});

test("splitName", () => {
  assert.deepEqual(splitName("Jane"), { first: "Jane", last: "" });
  assert.deepEqual(splitName("Jane Doe"), { first: "Jane", last: "Doe" });
  assert.deepEqual(splitName("Mary Ann Smith"), { first: "Mary Ann", last: "Smith" });
  assert.deepEqual(splitName("John Smith Jr."), { first: "John", last: "Smith Jr." });
});

test("a one-word name is sent without a last name", async () => {
  assert.ok(accepted(await post({ name: "Cher" })));
  const create = calls.find((c) => c.method === "POST" && c.url === `${GD}/customers`);
  assert.equal(create.json.first_name, "Cher");
  assert.ok(!("last_name" in create.json));
});
