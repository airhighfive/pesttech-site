// The crew, in the order from the design handoff. Names and photos only for now (Dan, 2026-10-14);
// short bios may come later, and `role` shows under the name if one is ever set.
// Spellings match the handbook's Employee Directory. Photos were assigned by Dan from the numbered
// contact sheet (2026-10-15); files live in src/assets/img/team/ (made by `npm run images`).
const photo = (file) => `${file}.webp`;

export default [
  {
    name: "Shelby", role: null,
    serious: photo("pesttechholidayemeralddovephotography32"), seriousAlt: "Shelby, sitting cross-legged in a Pest Tech T-shirt",
    silly: photo("pesttechholidayemeralddovephotography34"), sillyAlt: "Shelby, peeking over the top of a paperback",
  },
  {
    name: "Andrew", role: null,
    serious: photo("pesttechholidayemeralddovephotography39"), seriousAlt: "Andrew, smiling in a Pest Tech T-shirt",
    silly: photo("pesttechholidayemeralddovephotography41"), sillyAlt: "Andrew, cradling a bowling pin like a baby",
  },
  {
    name: "Michael", role: null,
    serious: photo("emeralddovephotographypesttechattnoogaheadshotphotographer1"), seriousAlt: "Michael, in a Pest Tech cap and T-shirt",
    silly: photo("emeralddovephotographypesttechattnoogaheadshotphotographer6"), sillyAlt: "Michael, resting chin on hands",
  },
  {
    name: "Candace", role: null,
    serious: photo("pesttechholidayemeralddovephotography28"), seriousAlt: "Candace, in a Pest Tech T-shirt and a backward cap",
    silly: photo("pesttechholidayemeralddovephotography30"), sillyAlt: "Candace, giving the camera some side-eye",
  },
  {
    name: "Donavon", role: null,
    serious: photo("emeralddovephotographypesttechattnoogaheadshotphotographer2"), seriousAlt: "Donavon, in a blue work shirt",
    silly: photo("emeralddovephotographypesttechattnoogaheadshotphotographer7"), sillyAlt: "Donavon, in a hard hat and sunglasses, holding a paddle",
  },
  {
    name: "Jonathan", role: null,
    serious: photo("pesttechheadshots02"), seriousAlt: "Jonathan, smiling in a Pest Tech T-shirt",
    silly: photo("pesttechheadshots06"), sillyAlt: "Jonathan, in overalls",
  },
  {
    name: "Dan", role: null,
    serious: photo("pesttechheadshots14"), seriousAlt: "Dan, in a Pest Tech cap and T-shirt",
    silly: photo("pesttechheadshots16"), sillyAlt: "Dan, on the phone and pointing",
  },
];
