# URBANLINKS Hero Assets

The hero uses editable HTML for its logo placement, copy, phone screens, menu,
and glass URL bubble. None of the demonstration phone content links to a store.
The arrow in the URL bubble uses the existing page creation flow.

## Image Generation

Mode: built-in image generation, not the fallback CLI.

The supplied hero reference guided the lighting, materials, and composition.
The prompts below record the final asset specifications. All selected images
were copied into the project and optimized as WebP.

### Desktop Background

Saved as `public/card/hero-studio.webp`.

Prompt specification: Create a full-bleed 4:3 website hero background plate
based on the reference. Preserve ivory curtains with soft vertical folds,
warm off-white plaster on the left, pale travertine stone along the bottom,
a small beige rounded clay character with eyes at the lower right, and one
realistic graceful hand entering from the lower right. Remove all phones,
interfaces, words, logos, buttons, icons, squiggles, and black letterboxing.
Keep the left 46 percent quiet for HTML text and the center/right empty for
HTML phones. Keep the hand in the lower-right quarter and stone in the bottom
14 percent. Use neutral ivory, soft daylight, and no yellow cast.

### Mobile Background

Saved as `public/card/hero-studio-mobile.webp`.

Prompt specification: Recompose the desktop plate as a vertical 9:16 mobile
background, not a crop. Retain the ivory curtains, cream wall, travertine,
hand, and small clay character. Keep the left half bright and empty, curtains
on the right, and stone in the bottom 17 percent. Make the hand smaller,
positioned between 60 and 100 percent horizontally and 55 and 90 percent
vertically; keep fingertips right of 55 percent. Put the small character at
the far right behind the hand. Keep the top third empty. No phones, text,
logos, or interfaces.

### Demonstration Fashion Photography

Saved as `public/card/demo-fashion.webp`.

Prompt specification: Vertical 3:4 editorial photograph of a fictional adult
East Asian lifestyle creator with shoulder-length dark hair, a light taupe
cardigan with shell buttons, and an ivory linen skirt. She holds a small cream
bouquet and looks left. Show shoulders and torso in a boutique with ivory
curtains, desaturated neutral colors, and soft daylight. No text, phones,
graphics, or logos.

The existing `demo-creator.webp` and `demo-collection.webp` demonstration
assets are reused in the phone galleries.

## Verification

- Responsive browser checks: 320, 390, 430, 768, and 1440 pixel widths.
- No horizontal overflow or unloaded images in the tested mobile layouts.
- Scroll reveal, phone screen movement, navigation menu, and creation link checked.
- Reduced motion removes the sticky scroll sequence and shows a static scene.
- Physical iOS/Android devices and Safari have not been tested.
