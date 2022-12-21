// I'm going to regret making this, aren't I?

import { ammonia, AmmoniaBuilderWASM, initWASM } from "../deps.ts";
await ammonia.init();

// ugly rules to add at least some explicit exceptions to styling
const builder = new ammonia.AmmoniaBuilder();
createExceptions(builder);

const raw = {
  tags: Array.from(builder.tags.values()),
  cleanContentTags: Array.from(builder.cleanContentTags.values()),
  genericAttributes: Array.from(builder.genericAttributes.values()),
  tagAttributes: Object.fromEntries(
    Array.from(builder.tagAttributes.entries())
      .map(([name, val]) => [name, Array.from(val.values())]),
  ),
  tagAttributeValues: Object.fromEntries(
    Array.from(builder.tagAttributeValues.entries())
      .map((
        [name, val],
      ) => [
        name,
        Object.fromEntries(
          Array.from(val.entries())
            .map((
              [name, val],
            ) => [
              name,
              Array.from(val.values()),
            ]),
        ),
      ]),
  ),
  setTagAttributeValues: Object.fromEntries(
    Array.from(builder.setTagAttributeValues.entries())
      .map(([name, val]) => [name, Object.fromEntries(val.entries())]),
  ),
  urlSchemes: Array.from(builder.urlSchemes.values()),
  linkRel: builder.linkRel,
  allowedClasses: Object.fromEntries(
    Array.from(builder.allowedClasses.entries())
      .map(([name, val]) => [name, Array.from(val.values())]),
  ),
  stripComments: builder.stripComments,
  idPrefix: builder.idPrefix,
  genericAttributePrefixes: builder.genericAttributePrefixes === null
    ? null
    : Array.from(builder.genericAttributePrefixes.values()),
};

function createExceptions(builder) {
  // allow basic colors in p, span, h1-h6, b, i, ul, ol, li.
  const stylingExceptions = new Map().set(
    "style",
    new Set().add("color:black")
      .add("color:silver")
      .add("color:gray")
      .add("color:white")
      .add("color:maroon")
      .add("color:red")
      .add("color:purple")
      .add("color:fuchsia")
      .add("color:green")
      .add("color:lime")
      .add("color:olive")
      .add("color:yellow")
      .add("color:navy")
      .add("color:blue")
      .add("color:teal")
      .add("color:aqua"),
  );

  builder.tagAttributeValues.set(
    "p",
    stylingExceptions,
  ).set(
    "span",
    stylingExceptions,
  ).set(
    "h1",
    stylingExceptions,
  ).set(
    "h2",
    stylingExceptions,
  ).set(
    "h3",
    stylingExceptions,
  ).set(
    "h4",
    stylingExceptions,
  ).set(
    "h5",
    stylingExceptions,
  ).set(
    "h6",
    stylingExceptions,
  ).set(
    "b",
    stylingExceptions,
  ).set(
    "i",
    stylingExceptions,
  ).set(
    "ol",
    stylingExceptions,
  ).set(
    "il",
    stylingExceptions,
  );
}

export const cleaner = new AmmoniaBuilderWASM(raw); // html cleaner object
