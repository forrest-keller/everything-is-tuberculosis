// Single source of truth for the fake "Wikipedia" the E2E suite plays
// against — shared by fixture-wiki-server.mjs (which serves this content)
// and the spec files (which assert against these exact titles). A small,
// fixed link graph in place of the real, genuinely-random Wikipedia lets a
// browser test reliably click its way to Tuberculosis: every mode's
// "starting article" always resolves to RANDOM_START_TITLE.

export const RANDOM_START_TITLE = "Portal Vein";
export const MIDDLE_TITLE = "Hepatic Disease";
export const TARGET_TITLE = "Tuberculosis";

export const ARTICLES = {
  [RANDOM_START_TITLE]: {
    name: RANDOM_START_TITLE,
    html: `
      <p>The portal vein carries blood to the liver. It is relevant to
      <a rel="mw:WikiLink" href="./Hepatic_Disease">Hepatic Disease</a>.</p>
      <p>See also: <a rel="mw:ExtLink" href="https://example.com">an external reference</a>,
      which should not be clickable in the game.</p>
      <p><a rel="mw:WikiLink" class="new" href="./Nonexistent_Page">Nonexistent Page</a>
      (a redlink, also not clickable).</p>
      <p><a rel="mw:WikiLink" href="./Category:Anatomy">Category:Anatomy</a>
      (a non-article namespace, also not clickable).</p>
    `,
  },
  [MIDDLE_TITLE]: {
    name: MIDDLE_TITLE,
    html: `
      <p>Hepatic disease can arise from several causes, including
      <a rel="mw:WikiLink" href="./Tuberculosis">Tuberculosis</a>.</p>
    `,
  },
  [TARGET_TITLE]: {
    name: TARGET_TITLE,
    html: `<p>Tuberculosis is an infectious disease usually caused by bacteria.</p>`,
  },
};
