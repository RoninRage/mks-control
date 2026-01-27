---
description: MKS Control - Clean Code and Development Guidelines
applyTo: '**'
---

## Code Quality Standards

### Vue Components

- Use `<script setup lang="ts">` for all Vue components
- Always define component name with `defineOptions({ name: 'ComponentName' })`
- Keep components focused on a single responsibility
- Use scoped styles with `<style scoped lang="scss">`
- Import components using path aliases (`components/`, `layouts/`, `pages/`)

### TypeScript

- Enable strict mode in tsconfig
- Always provide explicit type annotations for function parameters and return types
- Use interfaces over types for object shapes
- Avoid `any` type - use `unknown` and type guard instead

### Styling

- Use SCSS with BEM naming convention (`.block__element--modifier`)
- Leverage Quasar's utility classes (flexbox, spacing, colors)
- Define theme colors in CSS variables for dark mode compatibility
- Ensure all icons and images support light/dark mode theming

### Project Structure

- `/layouts` - Layout components (MainLayout, etc.)
- `/pages` - Page components (routing targets)
- `/components` - Reusable UI components
- `/assets/icons` - SVG icon files

### Theming & Dark Mode

- All custom icons must support dark mode using `currentColor` or CSS filters
- Use Quasar's `$q.dark.isActive` for theme-aware logic
- Test all UI in both light and dark modes
- Ensure sufficient contrast in both themes (WCAG AA minimum)

### Button & Icon Dark Mode Handling

- **Buttons with `color="primary"`**: Must have explicit dark mode color styling in `app.scss`
  - Light mode: `color: #111111 !important;` (black)
  - Dark mode: `color: #ffffff !important;` (white)
  - Target selectors: `.q-btn.text-primary` (Quasar applies `text-primary` class, not `color` attribute)
  - Include hover/active states with appropriate background colors

- **Icons with `color="primary"`**: Must have explicit dark mode color styling in `app.scss`
  - Light mode: `color: #111111 !important;` (black)
  - Dark mode: `color: #ffffff !important;` (white)
  - Target selector: `.q-icon.text-primary`

- **CSS Pattern for Dark Mode**:

  ```scss
  // Light mode (default)
  .q-btn.text-primary,
  .q-icon.text-primary {
    color: #111111 !important;
  }

  // Dark mode override
  body.body--dark {
    .q-btn.text-primary,
    .q-icon.text-primary {
      color: #ffffff !important;
    }
  }
  ```

- Always use `!important` to override Quasar's theme color system
- Add styling to `src/css/app.scss` in the global style section, not in component scoped styles

### File Naming

- Components: PascalCase (e.g., `RfidIcon.vue`)
- Pages: PascalCase (e.g., `IndexPage.vue`)
- Utilities: camelCase (e.g., `helpers.ts`)

### Touchscreen Usability

- **Touch Target Size**: All interactive elements (buttons, links, inputs) must be at least 44x44px or 48x48px
  - Buttons: minimum `height: 44px` and sufficient padding
  - Icon buttons: minimum size of 44x44px
  - Spacing between targets: at least 8-16px to prevent accidental taps

- **Avoid Hover-Only Interactions**: Touchscreen devices don't support hover
  - Don't rely on `:hover` to show important information (use active/focus states)
  - Implement `@click` or tap handlers for interactions
  - Use `.active` or `.focused` states for visual feedback
  - Consider using tooltips for hints instead of hover text

- **Touch-Friendly Spacing**:
  - Add adequate padding around interactive elements
  - Use `q-pa-md` (16px) or larger spacing around buttons and clickable areas
  - Avoid small, tightly-packed controls

- **Mobile Responsiveness**:
  - Test all pages on mobile devices (iOS and Android)
  - Use Quasar's responsive utilities (`.xs`, `.sm`, `.md`, `.lg`, `.xl`)
  - Ensure forms are usable with on-screen keyboards
  - Avoid fixed positioning that interferes with mobile viewports

- **Input Fields**:
  - Use appropriate `type` attributes (`email`, `number`, `tel`, `date`, etc.) for better mobile keyboards
  - Ensure inputs have adequate padding and size for touch interaction
  - Labels should be clear and associated with inputs for accessibility

- **Testing on Touchscreen**:
  - Test with actual touchscreen devices or tablet emulation in DevTools
  - Verify buttons and links are easily tappable (not misclicking nearby elements)
  - Check that modals and dialogs work with touch interactions
  - Validate form submission on touch devices

### Testing & Validation

- Test dark/light mode toggle functionality
- Verify responsive layout on mobile devices
- Check icon/image visibility in both themes
- Validate form inputs with proper error handling

### Commit Guidelines

- Write clear, descriptive commit messages
- Reference related issues or features
- Keep commits atomic and focused on single changes
- Keep the about page up to date with any new features or changes
