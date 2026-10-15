// Shared data for every page in src/services/: the service layout, the Squarespace slug as the
// URL (/skeeters, /termites, ...), and a Service JSON-LD block.
import site from "../_data/site.js";

export default {
  layout: "service.njk",
  navKey: "services",
  eleventyComputed: {
    slug: (data) => data.page.fileSlug,
    permalink: (data) => `/${data.page.fileSlug}.html`,
    title: (data) => data.title || data.serviceName,
    pageSchema: (data) => {
      const service = {
        "@context": "https://schema.org",
        "@type": "Service",
        name: data.serviceName,
        serviceType: data.serviceName,
        description: data.description,
        url: `${site.url}/${data.page.fileSlug}`,
        provider: { "@id": `${site.url}/#business` },
        areaServed: { "@type": "City", name: "Chattanooga, TN" },
      };
      if (data.offers) service.offers = data.offers;
      return service;
    },
  },
};
