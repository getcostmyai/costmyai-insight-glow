# Instagram profile picture, 320x320

Produce a square Instagram avatar from the uploaded CostMyAI wordmark: the full one-line wordmark, centred on a solid white background.

## Output

- `/mnt/documents/social/costmyai-instagram-320.png` — 320 x 320, white background, no transparency
- Also render a 1080 x 1080 master (`costmyai-instagram-1080.png`) so the same artwork can be reused where Instagram or other profiles accept a larger upload

## Composition

- Source: the uploaded wordmark PNG (black "Cost"/"AI", brand gradient on "My")
- Trim the surrounding empty space, then scale the wordmark to roughly 86% of the square's width
- Centre it optically — the "y" descender means the visual centre sits slightly above the geometric centre
- Solid `#FFFFFF` background, flattened (no alpha)
- No extra glyphs, ribbon, or mesh: white background only, as requested

## Technical notes

- Done with ImageMagick on the uploaded file: trim, resize to the target inner width, extend onto a white square canvas, flatten, then export at 1080 and downscale to 320 with Lanczos for a clean edge on the small size
- These are deliverables in the documents folder, not app assets; no project source files change
- Both renders get inspected at actual size before delivery to confirm the "y" is not clipped and the gradient reads correctly
