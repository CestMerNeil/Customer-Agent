## ADDED Requirements

### Requirement: Single design-token foundation
The renderer SHALL derive color, typography, spacing, radius, elevation, and motion from one shared token source consumed through the MUI theme, and SHALL NOT use per-component hardcoded brand colors.

#### Scenario: Tokens drive all surfaces
- **WHEN** the app renders navigation, top bar, and any page content
- **THEN** their colors, type scale, spacing, and radii resolve from the shared token set rather than inline literals duplicated per component

#### Scenario: Accent and neutrals are consistent
- **WHEN** an interactive element shows its active, hover, or focus state
- **THEN** the accent and neutral values used come from the token palette roles, so the same role looks identical across pages

### Requirement: Unified layout shell
The renderer SHALL present navigation, top bar, and content as one visually unified surface rather than a dark rail combined with separately styled light content.

#### Scenario: Navigation and content read as one app
- **WHEN** a user views any page
- **THEN** the navigation, top bar, and content share the unified surface language defined by the token foundation, with consistent contrast and elevation

### Requirement: Task-oriented navigation information architecture
The renderer SHALL organize navigation around operator tasks, with the human-review workspace as the default landing surface.

#### Scenario: App opens on the review workspace
- **WHEN** the app launches with no prior selection
- **THEN** the review workspace is the active surface

#### Scenario: Navigation exposes all operator areas
- **WHEN** a user inspects the navigation
- **THEN** review, accounts, knowledge, model, settings, and logs are each reachable, labeled, and indicate the active surface

### Requirement: Accessible interactive surfaces
The renderer SHALL make interactive surfaces keyboard operable, focus-visible, and labeled for assistive technology.

#### Scenario: Keyboard navigation between surfaces
- **WHEN** a user moves focus with the keyboard and activates a navigation item
- **THEN** the item is reachable, shows a visible focus indicator, exposes its label and active state to assistive technology, and switches the surface on activation
