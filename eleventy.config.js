export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/_redirects": "_redirects", "src/_headers": "_headers" });

  // Pages are written as /name.html, which Cloudflare Pages serves at /name. That keeps
  // every Squarespace URL exactly as it was (no trailing slash, no redirect hop).
  eleventyConfig.addFilter("cleanUrl", (url) => (url || "").replace(/index\.html$/, "").replace(/\.html$/, ""));

  eleventyConfig.addFilter("reviewBy", (reviews, name) => reviews.find((r) => r.name === name));
  eleventyConfig.addFilter("newestFirst", (reviews) => [...reviews].sort((a, b) => b.date.localeCompare(a.date)));
  eleventyConfig.addFilter("except", (services, slug) => services.filter((s) => s.slug !== slug));
  eleventyConfig.addFilter("year", (date) => String(date).slice(0, 4));

  // Mirror Cloudflare Pages locally: /skeeters serves skeeters.html.
  eleventyConfig.setServerOptions({
    middleware: [
      (req, res, next) => {
        const [path, query] = req.url.split("?");
        if (path !== "/" && !path.endsWith("/") && !/\.[a-z0-9]+$/i.test(path)) {
          req.url = `${path}.html${query ? `?${query}` : ""}`;
        }
        next();
      },
    ],
  });

  return {
    dir: { input: "src", output: "_site" },
    templateFormats: ["njk", "md"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
}
