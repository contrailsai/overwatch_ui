# Overwatch UI Theme: "Calm Focus"

## Design Philosophy
The "Calm Focus" design system is engineered for high-volume content reviewers who spend hours processing potentially distressing material. The goal is to minimize cognitive load and visual fatigue while maintaining a highly professional, trustworthy aesthetic.

**Core Tenets:**
1.  **Clarity over Decoration:** Every pixel must serve a purpose. Remove visual noise.
2.  **Calming Palette:** cool neutrals (Slate/Gray) and trustworthy blues. Avoid high-saturation warning colors unless absolutely necessary (threat detection).
3.  **Soft Precision:** Rounded corners (radius-md to lg), subtle borders, and soft shadows to create a sense of stability and ease.
4.  **Readable Hierarchy:** Strong typographic contrast using the **Outfit** font family to guide the eye effortlessly.

## Color System (Tailwind/OKLCH)

### Primary Brand
- **Blue-600 (Brand):** Trust, Authority, Action. Used for primary buttons and active states.
- **Slate-900 (Text):** High contrast but softer than pure black.
- **Slate-500 (Muted):** Secondary text, instructions.

### Functional Colors
- **Background:** `oklch(0.985 0.002 247.858)` (Very light cool gray/white).
- **Surface (Card):** `oklch(1 0 0)` (Pure White) with subtle borders.
- **Border:** `oklch(0.92 0.01 255.5)` (Soft cool gray).

### Semantic Colors
- **Threat/Danger:** `oklch(0.65 0.22 28.5)` (Refined Red, not neon).
- **Safe/Clear:** `oklch(0.65 0.18 150.5)` (Calm Green).

## Typography: Outfit
- **Headings:** Outfit Medium/Bold. Tight tracking for clear, punchy headers.
- **Body:** Outfit Regular/Light. Optimized for long-form reading and data scanning.
- **Data/Code:** Monospace (if needed) or tabular nums for tables.

## Component Styling

### Cards & Surfaces
- **Style:** Flat, white background, 1px solid border (`border-slate-200`).
- **Shadow:** Minimal or none by default. Hover states can lift slightly (`shadow-sm`).
- **Radius:** `rounded-xl` (roughly 12px) for a modern, friendly feel.

### Buttons
- **Primary:** Solid Brand Blue. Medium radius (`rounded-lg`). Hover: slightly deeper blue.
- **Secondary:** White with Border. Hover: very light slate background.
- **Ghost:** Transparent. Hover: light slate background.

### Inputs
- **Style:** Clean, ample padding (`h-10` or `h-11`).
- **Focus:** Brand Blue ring, but subtle (`ring-2`, `ring-offset-1`).

## Layout Patterns
- **Sidebar:** Fixed, dark or light (user preference, defaulting to clean light sidebar for "Calm Focus").
- **Content Area:** Centered or wide, with generous padding (`p-6` or `p-8`).
- **Data Tables:** Clean rows, plenty of whitespace. No zebra striping unless data is very dense.

## "Calm Focus" Checklist for Developers
- [ ] Is this element necessary?
- [ ] Is the spacing consistent?
- [ ] Is the text legible?
- [ ] Does the color mean something?
