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

### File Naming

- Components: PascalCase (e.g., `RfidIcon.vue`)
- Pages: PascalCase (e.g., `IndexPage.vue`)
- Utilities: camelCase (e.g., `helpers.ts`)

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
