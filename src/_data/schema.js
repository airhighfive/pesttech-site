// Site-wide LocalBusiness JSON-LD, built from site.js. Rendered in the <head> of every page.
// schema.org has no PestControl type, so this uses HomeAndConstructionBusiness (a LocalBusiness subtype).
import site from "./site.js";

const address = {
  "@type": "PostalAddress",
  streetAddress: site.address.street,
  addressLocality: site.address.city,
  addressRegion: site.address.region,
  addressCountry: site.address.country,
};
if (site.address.postalCode) address.postalCode = site.address.postalCode;

const business = {
  "@context": "https://schema.org",
  "@type": "HomeAndConstructionBusiness",
  "@id": `${site.url}/#business`,
  name: site.name,
  legalName: site.legalName,
  description: site.summary,
  foundingDate: String(site.founded),
  url: site.url,
  logo: site.url + site.logo.src,
  telephone: site.phone.schema,
  address,
  openingHours: site.hours.schema,
  areaServed: site.areaServed.map((name) => ({ "@type": "Place", name })),
  knowsAbout: [
    "Pest control", "Mosquito control", "Termite control", "German cockroach control",
    "Bed bug treatment", "Rodent control", "Hemlock woolly adelgid treatment",
  ],
};
business.hasCredential = site.licenses.map((license) => ({
  "@type": "EducationalOccupationalCredential",
  credentialCategory: "license",
  name: license.name,
  identifier: license.number,
  recognizedBy: { "@type": "GovernmentOrganization", name: license.issuer },
}));
if (site.sameAs.length) business.sameAs = site.sameAs;

export default { business };
