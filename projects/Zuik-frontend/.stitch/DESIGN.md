# Design System: Zuik - Intent-Based DeFi Automation

## 1. Visual Theme & Atmosphere

A refined, warm-dark interface with confident asymmetric layouts and orchestrated spring-physics motion. The atmosphere is luxurious yet utilitarian - like a high-end trading terminal designed by a Scandinavian design studio. Density: 6 (balanced-dense), Variance: 7 (offset asymmetric), Motion: 7 (fluid spring + perpetual micro-interactions). The palette draws from molten gold meeting obsidian - warm amber/orange tones against deep charcoal surfaces create a sense of financial sophistication without cold sterility.

## 2. Color Palette & Roles

### Neutrals
- **Obsidian** (#0C0C0E) - App background, deepest surface
- **Charcoal** (#141416) - Primary card/panel surfaces
- **Graphite** (#1C1C20) - Elevated surfaces, sidebar, modal backgrounds
- **Slate Edge** (#2A2A30) - Borders, dividers, subtle separations
- **Ash** (#3A3A42) - Secondary borders, hover states
- **Muted Steel** (#71717A) - Secondary text, descriptions, metadata
- **Silver** (#A1A1AA) - Tertiary text, placeholders
- **Chalk** (#E4E4E7) - Primary text, headings
- **Snow** (#FAFAFA) - Highest contrast text, active states

### Accent
- **Amber Gold** (#E8913A) - Single primary accent for CTAs, active states, focus rings, brand identity
- **Warm Glow** (rgba(232, 145, 58, 0.12)) - Accent tint for backgrounds, hover states
- **Deep Amber** (#C67A2E) - Accent pressed/active state

### Semantic
- **Success Jade** (#34D399) - Positive outcomes, confirmations
- **Error Coral** (#F87171) - Destructive actions, errors
- **Warning Honey** (#FBBF24) - Caution states
- **Info Cyan** (#38BDF8) - Informational highlights

## 3. Typography Rules

- **Display/Headlines:** `Outfit` (Google Fonts) - Track-tight (-0.02em), weight 600-800, controlled scale. Hierarchy through weight and subtle color shifts, not massive size jumps
- **Body:** `Satoshi` (CDN) - Relaxed leading (1.6), max 65ch per line, weight 400-500. If unavailable, fallback to `Outfit`
- **Monospace:** `JetBrains Mono` (Google Fonts) - For code, metadata, wallet addresses, transaction IDs, numeric data
- **Scale:** Display 3rem / H1 2.25rem / H2 1.75rem / H3 1.25rem / Body 0.9375rem / Small 0.8125rem / Micro 0.6875rem
- **Banned:** Inter, Roboto, Arial, Space Grotesk, system fonts. No generic serifs.

## 4. Component Stylings

* **Buttons:** Flat fill with no outer glow. Tactile -1px translateY on active. Amber Gold fill for primary, ghost/outline for secondary. Border-radius: 10px. Font-weight: 600. Padding: 10px 20px. Transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1)
* **Cards:** Generous rounded corners (14px). 1px Slate Edge border. Charcoal fill. No box-shadow - depth through border and background color contrast. High-density views: replace with border-top dividers or grouped rows
* **Inputs:** Label above input. Graphite fill with Slate Edge border. Focus ring in Amber Gold (2px). Border-radius: 10px. Padding: 10px 14px. Placeholder in Silver
* **Modals:** Obsidian backdrop (85% opacity) with 12px blur. Graphite surface. Max-width 480px. Rounded 16px. Slide-up + fade entrance
* **Tooltips:** Graphite fill, Snow text, 8px radius, 6px padding
* **Badges/Chips:** Graphite fill, Slate Edge border, 6px radius, font-weight 600, 0.75rem size

## 5. Layout Principles

- CSS Grid over Flexbox percentage math
- Max-width containment: 1320px centered with clamp(1rem, 4vw, 3rem) side padding
- Full-height sections use min-height: 100dvh
- Asymmetric hero: 55/45 or 60/40 splits, never centered
- Feature sections: 2-column zig-zag or asymmetric grid, NEVER 3-equal-cards
- Mobile-first collapse below 768px to single column
- Generous internal padding: clamp(1.5rem, 3vw, 2.5rem)
- Sidebar fixed width: 280px collapsed to icon-only 56px

## 6. Motion & Interaction

- Spring physics: cubic-bezier(0.34, 1.56, 0.64, 1) for bouncy entrances
- Ease out: cubic-bezier(0.16, 1, 0.3, 1) for general transitions
- Staggered cascade: 60ms delay between sibling elements on reveal
- Scroll-reveal: translateY(24px) + opacity 0 -> revealed state
- Perpetual micro-loops: subtle pulse on active indicators, floating animation on hero elements
- Performance: Only animate transform and opacity. Grain/noise on fixed pseudo-elements
- Page transitions: 200ms fade
- Hover states: scale(1.02) on cards, background-color shift on buttons (150ms)

## 7. Background Patterns

- **Landing mesh grid:** Very small (20px) grid lines in Amber Gold at 4-6% opacity on Obsidian background. Creates a subtle "graph paper" feel. Grid generated via repeating-linear-gradient
- **Canvas:** Dot pattern via React Flow built-in, color Ash at 40% opacity
- **Sections:** Subtle radial gradients of Warm Glow fading from focal points

## 8. Anti-Patterns (Banned)

- No emojis anywhere - use Lucide SVG icons exclusively
- No Inter, Roboto, or generic system fonts
- No pure black (#000000) - use Obsidian (#0C0C0E)
- No neon/outer glow shadows
- No oversaturated accents (saturation < 80%)
- No 3-column equal card layouts
- No AI copywriting cliches ("Elevate", "Seamless", "Unleash", "Next-Gen")
- No filler UI text ("Scroll to explore", scroll arrows, bouncing chevrons)
- No broken image links
- No overlapping elements - clean spatial separation always
- No centered hero sections - force asymmetric layouts
- No mock/placeholder data - real or clearly labeled placeholders only
- No purple gradients, no blue neon
- No custom mouse cursors
