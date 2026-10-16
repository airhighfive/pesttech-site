// FAQ copy. The page and its FAQPage schema both render from this list, so they can't drift apart.
// Answers are HTML; the schema gets a tag-stripped copy. The first sentence of each answer is the answer
// (voice guide, section 6), and there are no em or en dashes.
const items = [
  {
    id: "cost",
    nav: "Cost",
    q: "What does regular pest control cost?",
    a: "For most homes in our service area, a Regular Service Program runs <b>$40 to $60 a month</b>. That covers scheduled seasonal treatments, plus any extra visits needed in between at no charge. Larger homes or special situations may differ. We'll visit and take a look before we start work.",
  },
  {
    // Dan, 2026-10-15: fine to say "quarterly" here, since it's what people search for.
    id: "quarterly",
    nav: "Quarterly service",
    q: "Is Regular Service the same as quarterly pest control?",
    a: 'Pretty close. It works out to about four visits a year, but we time them to the seasons instead of the calendar. Our applications change a bit throughout the year, rather than the exact same procedure each visit. Problems between visits are included if they pop up. More on the <a href="/regular-service">Regular Service page</a>.',
  },
  {
    id: "contracts",
    nav: "Contracts",
    q: "Do you require contracts?",
    a: "We have a service agreement, mostly to keep our state regulators happy. But the Regular Service Program doesn't come with a long-term commitment.",
  },
  {
    // Rewritten per the voice guide's hard rule 2: no safety claims about treatments.
    id: "pets",
    nav: "Kids and pets",
    q: "Do I need to worry about my kids and pets?",
    a: "For most services, no. Friendly or contained pets aren't a problem. We apply every product according to its label, and after an outside treatment we'll ask you to keep kids and pets inside for about an hour so it can dry. Bed bug and flea treatments can be exceptions; you'll get specific instructions for those.",
  },
  {
    id: "onetime",
    nav: "One-time visits",
    q: "Do you do one-time services?",
    a: "Yes, for specific problems like a wasp nest, a roach flare-up, or a mouse in the pantry. Most folks who start with a one-time visit end up on the Regular Service Program because it's cheaper than fighting fires, but it's not required.",
  },
  {
    id: "speed",
    nav: "How fast",
    q: "How fast can you come out?",
    a: "It depends on what part of town you're in, but we can usually make it over within a day or two. Texting us is the fastest way to find out availability.",
  },
  {
    id: "between",
    nav: "Between visits",
    q: "What if bugs show up between visits?",
    a: "If something pops up that we didn't expect, text us and we'll come back between scheduled visits at no extra charge.",
  },
  {
    id: "termites",
    nav: "Termites",
    q: "What about termites?",
    a: 'We have a few different ways to protect a house from termites. We\'d like to stop by, take a look, and talk you through the options that make sense for your home. We also do termite inspections for real estate closings. Our termite work is in Tennessee only. More on the <a href="/termites">termites page</a>.',
  },
];

const text = (html) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

export default {
  items,
  schema: {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: text(item.a) },
    })),
  },
};
