# Overwatch UI Theme

## Design Philosophy
"Overwatch" embodies a **clean, professional, and vigilant** aesthetic. It combines the reliability of enterprise software with the sleekness of modern SaaS applications. The interface is designed for clarity, speed, and precision—essential for threat detection.

## Core Visual Elements

### 1. Color Palette
- **Primary:** Deep Blue (`bg-blue-700`, `text-blue-700`) - Represents trust, security, and authority.
- **Secondary:** Slate/Gray (`bg-slate-900`, `text-slate-500`) - Provides a neutral, high-contrast backdrop for data.
- **Accents:**
    - **Alert/Danger:** Red (`text-red-500`) for threats and errors.
    - **Success:** Green (`text-green-500`) for resolutions and safe states.
    - **Warning:** Orange/Amber (`text-orange-500`) for pending items.
- **Backgrounds:**
    - App Background: `bg-gray-50` (soft, easy on eyes).
    - Component Background: `bg-white` (clean, distinct).

### 2. Typography
- **Font Family:** `Outfit` (Sans-serif).
- **Headings:** Bold, often uppercase or tracking-widest for "technical" feel (e.g., "OVERWATCH" logo).
- **Body:** Clean, legible, `text-slate-600` for readability.

### 3. Shape & Structure
- **Borders:** Subtle `border-gray-200`.
- **Radius:** Moderate rounding (`rounded-md` to `rounded-xl`).
- **Shadows:** Soft, diffused shadows (`shadow-lg`, `shadow-xl`) to lift active elements.
- **Spacing:** Generous padding (`p-6`, `p-8`) to prevent clutter.

### 4. Components (shadcn/ui)
We utilize `shadcn/ui` for a consistent component library.
- **Buttons:** Primary (Blue), Ghost (Gray/Transparent for secondary actions).
- **Cards:** White background, thin border, shadow for depth.
- **Inputs:** Minimalist borders, focus rings match primary color.

## Layout Patterns
- **Dashboard:** Sidebar navigation (collapsible/expandable) + Main Content Area.
- **Data Display:** Tables and Cards for case management.
- **Login:** Clean, centered focus, minimal distractions.
