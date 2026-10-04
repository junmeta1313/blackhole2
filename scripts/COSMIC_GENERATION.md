# Random observation image generation

GitHub Actions runs Node.js `crypto.randomInt()` before the image API call.
The image model does not choose numbers. `cosmic-options.json` contains the
user's detailed A–F options and compatibility tables.

Selection order: A → C → E → D → B → F.

- A is uniform among subjects not used in the last three new-system posts.
  Historical posts without `generationSelection` remain unchanged.
- C follows A's list. E is the intersection of A's and C's lists.
- D ticket weights are 15/25/30/20/10 for D1–D5.
- B starts with the supplied family weights. Gas/unknown subjects use equal
  base weights; A14 uses B2/B4/B5/B6 at 20 and B9 at 10.
  D1/D2 double the allowed B1/B6/B10 weights; D4/D5 double B3/B5/B9.
  After adjustment, B9 probability is capped at 5% for planets/stars,
  10% for black holes, and 15% otherwise. These are probabilities, not
  guaranteed quotas in a short run.
- F follows A's list and is filtered by the chosen C/E branch. E1/E6 exclude
  background-dependent F1/F5/F9; E1 also excludes F3/F7/F8.
  Prompts require a few background stars for F5/F9, at least 2–3 units for F7,
  and both sides of a break within the frame for F8.
- A2/A19 remain small even when generic E4 occupancy would be larger.
  A's subject-specific scale takes priority. An A8/F10 point stays faint.

`creativePrompt()` validates the full selection before the paid API call and
passes only the six selected detailed options plus common constraints.
Output stays 816×816, WebP, low quality, one image, with the existing model.
There is no crop, padding, prompt-writing AI call, or automatic paid retry.

Each new post stores `generationSelection`, `generationPrompt`, and
`generationVersion: 1`, plus its combination in `sceneKey`. Existing posts
and saved stories are retained. Image-based observational descriptions run
as before. Automatic four-hour limits and manual `--force` behavior remain.

Tests (mock API, no charges):

```sh
node --test scripts/cosmic-generator.test.mjs scripts/update-galleries.test.mjs scripts/describe-creations.test.mjs
```

Actual manual creation: GitHub Actions → Automatic Space Galleries →
Run workflow → mode `creative`. This generates one paid image and describes
pending images using GitHub's existing secret. Mode `descriptions` does not
create images. Actual model adherence remains probabilistic; the system
validates selection constraints, not every visual feature of the result.
