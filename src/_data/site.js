// Business facts used across every page, the footer, and the JSON-LD schema.
// `null` means "not decided yet": the templates leave that piece out until it's filled in (see TODO.md).
export default {
  name: "Pest Tech Chattanooga",
  legalName: "Pest Tech Chattanooga LLC",
  url: "https://pesttechchattanooga.com",
  tagline: "Modern, locally owned pest control in Chattanooga.",
  // Used in llms.txt and the schema description. No em or en dashes (voice guide).
  founded: 2015,
  summary:
    "Pest Tech is a locally owned pest control company in Chattanooga, Tennessee, founded in 2015. " +
    "It serves homes and businesses in Chattanooga, a little bit of North Georgia, and the neighborhoods within about 30 minutes of downtown. " +
    "New customers start with an inspection, and the work is environmentally conscious and designed to work around kids and pets.",

  phone: { display: "(423) 771-9393", tel: "+14237719393", schema: "+1-423-771-9393" },
  hours: { display: "Mon to Fri, 8 to 5", schema: ["Mo-Fr 08:00-17:00"] },

  // Physical location (schema + Google Business Profile). Spec Q3, resolved 2026-10-07.
  address: { street: "2301 Dodds Ave", city: "Chattanooga", region: "TN", postalCode: "37407", country: "US" },
  // Mailing address, shown labeled in the footer.
  mailing: { street: "PO Box 2434", city: "Chattanooga", region: "TN", postalCode: "37409" },
  // Tennessee charter number, shown in the footer and on /licensing-insurance (voice guide, hard rule 6).
  charter: "TN Charter #4988",
  // Licenses for /licensing-insurance, the schema (hasCredential), and llms.txt.
  // For reference: the GA pesticide contractor license covers mosquito and HWA work; the GA structural pest control
  // company license covers general household pest control (termite work in Georgia would need a separate license).
  licenses: [
    { name: "Tennessee pest control charter", number: "4988", issuer: "Tennessee Department of Agriculture" },
    { name: "Georgia pesticide contractor license", number: "101833", issuer: "Georgia Department of Agriculture" },
    { name: "Georgia structural pest control company license", number: "100434", issuer: "Georgia Department of Agriculture" },
  ],

  // No email address anywhere on the site (Dan, 2026-10-15): customers call or text.
  sameAs: [], // Google Business Profile, Facebook, Nextdoor, LinkedIn URLs
  googleReviewsUrl: null,

  radius: "about 30 minutes",
  // Named on /service-area and in the schema's areaServed.
  areaServed: [
    "Chattanooga", "Highland Park", "St. Elmo", "North Chattanooga", "North Shore", "Hill City",
    "Brainerd", "East Brainerd", "Hixson", "Red Bank", "East Ridge", "Downtown", "Ridgeside", "Lupton City",
    "Ooltewah", "Lookout Mountain", "Signal Mountain", "Walden", "Soddy-Daisy", "Tyner", "Harrison",
    "Rossville", "Fort Oglethorpe",
  ],

  logo: { src: "/assets/img/pest-tech-chattanooga-logo.png", width: 600, height: 159 },

  booking: {
    // GorillaDesk Online Booking iframe (GorillaDesk → Addons → Online Booking → Show Code, the iframe option).
    // Its optional embed.js resizer is left off (no JS outside the /book form); see `.booking iframe` in site.css.
    // Set to null to bring back the designed placeholder box (spec Q6).
    embedUrl: "https://portal-embed-v3.gorilladesk.com/?screen=booking&account_id=3312",
    // The plain request form posts here: functions/api/request.js, which writes a GorillaDesk lead and pings Slack.
    requestEndpoint: "/api/request",
  },

  images: {
    homeHero: null, // { src, alt, width, height }
    about: null,
  },
};
