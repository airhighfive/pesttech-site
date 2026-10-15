// FAQPage JSON-LD for /faq, built from the same list the page renders (src/_data/faq.js).
export default {
  eleventyComputed: {
    pageSchema: (data) => data.faq.schema,
  },
};
