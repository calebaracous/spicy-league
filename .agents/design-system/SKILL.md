---
name: spicy-league-design
description: Use this skill to generate well-branded interfaces and assets for Spicy League, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

When designing for Spicy League:
- Use the dark-mode-only palette: black (`#0A0A0A`) background, cream (`#F5F0E8`) text, dark red (`#B91C1C`) accent
- Typography: Geist Sans with fluid clamp() sizing, 500 weight headings, tight letter-spacing
- Copy tone: Direct, sarcastic, competitive but not serious — "sweaty gamers" vibe
- No gradients, no textures, minimal imagery — rely on whitespace and hierarchy
- Buttons are pill-shaped with opacity hover states (not color shifts)
- Use scroll-reveal animations (`fadeUp`, `reveal` classes) for progressive disclosure
- Iconography: Minimal — prefer text labels, use the flame logo as primary brand mark

Explore `/preview/` for component specimens, `/ui_kits/marketing-site/` for full page recreations with modular React components, and `colors_and_type.css` for the complete design token system.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.
