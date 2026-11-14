# Frontend design source

The user requested the visual direction from https://github.com/enesozturk/dimensional-drawing.

Inspected commit: `5c457437c8c83524308aad3b7443e81adcc13153`.
License: MIT, copyright 2026 Enes Ozturk. The complete notice is retained at `vendor/dimensional-drawing/LICENSE`.

This repository is a drawing skill, not a React component library. Its monochrome linework, thin rules, restrained fills, hatching and variable-based dimensions are adapted to the working planner in `app/dimensional.css`. Real content and the existing product name are retained because this is a functional application. Its separate reference sheet follows the skill's architecture-only, unbranded drawing convention.

`public/design/ui-card-sheet.html` reuses the example drawing kit with original measurements from the actual metric-card component. It is self-contained and does not need a skill installation or third-party scripts.

Observed browser measurements across four metric cards: 251×172 CSS pixels at the inspected desktop viewport; padding20, border1, gap8, outer radius10. Child row heights:32,44,16,14. Height closes as `H = 2·B + 2·S1 + H1 + H2 + H3 + H4 + 3·S2 = 172`. Width is fluid;251 is a measured reference, not a universal fixed width. Mobile wrapping can increase height.

The drawing makes no claims about unpublished viewports or text widths. Application engineering guarantees remain based on the independent verifier and recorded tests, not visual annotations.
