// Service list for the Services hub, the home page, "Other services" lines, and llms.txt, in display order.
// Each service's page copy lives in src/services/<slug>.njk; URLs keep the Squarespace slugs.
// Copy follows ../../pest-tech-website-voice-guide.md: no em or en dashes, and ranges use "to".
export default [
  {
    slug: "regular-service",
    name: "Regular Service Program",
    short: "Regular Service",
    blurb: "Seasonal maintenance focused on the outside of the house, to head off ants, wasps, and cockroaches before they get inside. Most homes pay $40 to $50 a month, and extra visits between treatments are included.",
  },
  {
    slug: "termites",
    name: "Termites",
    short: "Termites",
    blurb: "We do a lot of termite protection in Tennessee, on its own or as an add-on to Regular Service. We also treat active infestations, and do termite inspections and NPMA-33 letters for real estate closings.",
  },
  {
    slug: "skeeters",
    name: "Mosquitoes",
    short: "Mosquitoes",
    blurb: "Conventional barrier treatments, plus alternative mosquito control for difficult or sensitive situations.",
  },
  {
    // "Cockroaches" in copy; the slug stays /roaches because that's what people search.
    slug: "roaches",
    name: "German Cockroaches",
    short: "Cockroaches",
    blurb: "Specialized treatments that do more of the work up front, to get rid of German cockroaches quickly. No long-term agreement required.",
  },
  {
    slug: "rodents",
    name: "Rodents",
    short: "Rodents",
    blurb: "We clear out the mice or rats that are already inside, then find a long-term fix so they don't come back.",
  },
  {
    slug: "bed-bugs",
    name: "Bed Bugs",
    short: "Bed Bugs",
    blurb: "Thorough, discreet treatment for single-family homes. No judgment; they hitchhike into the nicest homes.",
  },
  {
    slug: "hemlock-woolly-adelgid",
    name: "Hemlock Woolly Adelgid",
    short: "Hemlock (HWA)",
    blurb: "Curative and preventive treatments, from a tree or two in the yard to forested tracts of 100 acres or more.",
  },
];
