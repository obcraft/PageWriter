# Graph Report - PageWriter  (2026-10-26)

## Corpus Check
- Corpus is ~31,448 words - fits in a single context window. You may not need a graph.

## Summary
- 819 nodes · 1484 edges · 53 communities (34 shown, 19 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.87)
- Token cost: measured semantic-agent usage unavailable. Stored 0 input / 0 output fields are placeholders, not measured zero usage. AST extraction uses no LLM.

## Community Hubs (Navigation)
- Public APIs and Planning
- Authentication and Server Runtime
- Application Dependency Catalog
- Sidebar and Panel Controls
- Cards and Context Menus
- DOM Operation Execution
- Shared UI Primitives
- Chrome Extension Manifest
- Package Metadata and Dependencies
- Development Tool Dependencies
- Buttons Dialogs and Pagination
- TypeScript Compiler Configuration
- Product Contracts and Workflows
- Navigation Badges and Toggles
- Community Hub Interaction
- Command Palette Dialogs
- UI Generator Configuration
- Form Selection Controls
- Menubar Components
- Carousel Interaction
- Form Field Context
- Landing Page Demonstration
- Chart Presentation
- Package Run Scripts
- Select Menu Components
- Drawer Panel Components
- Extension Background Coordination
- Breadcrumb Navigation
- Linting Configuration
- Extension Panel Test Environment
- Saved Rule Reapplication
- Extension Popup State
- DOM Operation Tests
- Tabbed UI Components
- Alert Presentation
- AI Request Run Identifiers
- Cron Request Authentication
- Toast Notifications
- Drizzle Tool Configuration
- Extension Icon 128px
- Extension Icon 32px
- Extension Icon 48px
- Bundler Dependency Overrides
- Website Favicon Design
- Vite Build Configuration
- Aspect Ratio Component
- Collapsible UI Component
- Test Assertion Setup
- Pagewright Brand Mark
- File Based Routing Conventions
- Extension Icon 16px
- Public Crawler Policy

## God Nodes (most connected - your core abstractions)
1. `cn()` - 220 edges
2. `react` - 45 edges
3. `compilerOptions` - 22 edges
4. `lucide-react` - 20 edges
5. `Button` - 12 edges
6. `@tanstack/react-router` - 10 edges
7. `class-variance-authority` - 10 edges
8. `renderMine()` - 9 edges
9. `scripts` - 9 edges
10. `buttonVariants` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Pick element and change page` --conceptually_related_to--> `Public reshape planning endpoint`  [INFERRED]
  extension/popup.html → AGENTS.md
- `Public shared configurations` --shares_data_with--> `Community setups hub`  [EXTRACTED]
  AGENTS.md → extension/hub.html
- `Share setup publicly` --conceptually_related_to--> `Server-owned authenticated sharing`  [INFERRED]
  extension/hub.html → AGENTS.md
- `Community account dialog` --conceptually_related_to--> `Extension account authentication`  [INFERRED]
  extension/hub.html → AGENTS.md
- `Pick element and change page` --implements--> `Natural-language local page customization`  [INFERRED]
  extension/popup.html → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **CSP-safe AI planning contract** — agents_reshape_endpoint, agents_openrouter_planning, agents_dom_operations, agents_pagewright_operations_tests [EXTRACTED 1.00]
- **Authenticated community sharing contract** — agents_shared_configs, agents_server_owned_sharing, agents_extension_auth, extension_hub_community_setups [EXTRACTED 1.00]

## Communities (53 total, 19 thin omitted)

### Community 0 - "Public APIs and Planning"
Cohesion: 0.05
Nodes (66): @tanstack/react-query, @tanstack/react-router, zod, describeThrown(), LovableErrorOptions, LovableEvents, reportLovableError(), Window (+58 more)

### Community 1 - "Authentication and Server Runtime"
Cohesion: 0.06
Nodes (44): @supabase/supabase-js, @tanstack/react-start, attachSupabaseAuth, createSupabaseFetch(), isNewSupabaseApiKey(), requireSupabaseAuth, createSupabaseClient(), createSupabaseFetch() (+36 more)

### Community 2 - "Application Dependency Catalog"
Cohesion: 0.04
Nodes (56): dependencies, ai, @ai-sdk/openai, class-variance-authority, clsx, cmdk, date-fns, embla-carousel-react (+48 more)

### Community 3 - "Sidebar and Panel Controls"
Cohesion: 0.06
Nodes (41): @radix-ui/react-separator, @radix-ui/react-tooltip, Input, Separator, SheetContent, SheetContentProps, SheetDescription, SheetFooter() (+33 more)

### Community 4 - "Cards and Context Menus"
Cohesion: 0.09
Nodes (35): @radix-ui/react-context-menu, @radix-ui/react-dropdown-menu, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle (+27 more)

### Community 5 - "DOM Operation Execution"
Cohesion: 0.13
Nodes (32): apply(), applyOne(), applyStep(), clip(), cssPath(), describe(), each(), flash() (+24 more)

### Community 6 - "Shared UI Primitives"
Cohesion: 0.07
Nodes (24): clsx, @radix-ui/react-avatar, @radix-ui/react-hover-card, @radix-ui/react-popover, @radix-ui/react-progress, @radix-ui/react-scroll-area, @radix-ui/react-slider, @radix-ui/react-switch (+16 more)

### Community 7 - "Chrome Extension Manifest"
Cohesion: 0.06
Nodes (30): action, default_icon, default_title, background, service_worker, commands, _execute_action, content_scripts (+22 more)

### Community 8 - "Package Metadata and Dependencies"
Cohesion: 0.07
Nodes (29): name, private, sideEffects, type, ai, @ai-sdk/openai, date-fns, drizzle-orm (+21 more)

### Community 9 - "Development Tool Dependencies"
Cohesion: 0.08
Nodes (25): devDependencies, drizzle-kit, drizzle-orm, eslint, eslint-config-prettier, @eslint/js, eslint-plugin-prettier, eslint-plugin-react-hooks (+17 more)

### Community 10 - "Buttons Dialogs and Pagination"
Cohesion: 0.12
Nodes (21): @radix-ui/react-slot, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter(), AlertDialogHeader(), AlertDialogOverlay (+13 more)

### Community 11 - "TypeScript Compiler Configuration"
Cohesion: 0.08
Nodes (23): compilerOptions, allowImportingTsExtensions, exactOptionalPropertyTypes, jsx, lib, module, moduleResolution, noEmit (+15 more)

### Community 12 - "Product Contracts and Workflows"
Cohesion: 0.11
Nodes (20): Extension account authentication, Chrome extension packaging, Lovable commit synchronization, OpenRouter strict JSON planning, Pagewright operation tests, Pagewright project rules, Public reshape planning endpoint, Public shared configurations (+12 more)

### Community 13 - "Navigation Badges and Toggles"
Cohesion: 0.11
Nodes (19): class-variance-authority, @radix-ui/react-navigation-menu, @radix-ui/react-toggle, @radix-ui/react-toggle-group, Badge(), BadgeProps, badgeVariants, NavigationMenu (+11 more)

### Community 14 - "Community Hub Interaction"
Cohesion: 0.27
Nodes (18): accessToken(), bareHost(), draw(), el(), getAccount(), getRules(), likeButton(), load() (+10 more)

### Community 15 - "Command Palette Dialogs"
Cohesion: 0.13
Nodes (17): cmdk, @radix-ui/react-dialog, Command, CommandDialog(), CommandEmpty, CommandGroup, CommandInput, CommandItem (+9 more)

### Community 16 - "UI Generator Configuration"
Cohesion: 0.11
Nodes (18): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+10 more)

### Community 17 - "Form Selection Controls"
Cohesion: 0.11
Nodes (15): input-otp, lucide-react, @radix-ui/react-accordion, @radix-ui/react-checkbox, @radix-ui/react-radio-group, AccordionContent, AccordionItem, AccordionTrigger (+7 more)

### Community 18 - "Menubar Components"
Cohesion: 0.11
Nodes (12): @radix-ui/react-menubar, Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarLabel, MenubarRadioItem, MenubarSeparator (+4 more)

### Community 19 - "Carousel Interaction"
Cohesion: 0.16
Nodes (16): embla-carousel-react, Button, Carousel, CarouselApi, CarouselContent, CarouselContext, CarouselContextProps, CarouselItem (+8 more)

### Community 20 - "Form Field Context"
Cohesion: 0.18
Nodes (14): @radix-ui/react-label, react-hook-form, FormControl, FormDescription, FormFieldContext, FormFieldContextValue, FormItem, FormItemContext (+6 more)

### Community 21 - "Landing Page Demonstration"
Cohesion: 0.16
Nodes (11): GESTURES, INCANTATIONS, Index(), POSTS, Route, SHARED, Spark, SparkleTrail() (+3 more)

### Community 22 - "Chart Presentation"
Cohesion: 0.24
Nodes (11): recharts, ChartConfig, ChartContainer, ChartContext, ChartContextProps, ChartLegendContent, ChartStyle(), ChartTooltipContent (+3 more)

### Community 23 - "Package Run Scripts"
Cohesion: 0.22
Nodes (9): scripts, build, build:dev, dev, format, lint, preview, test (+1 more)

### Community 24 - "Select Menu Components"
Cohesion: 0.28
Nodes (8): @radix-ui/react-select, SelectContent, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectSeparator, SelectTrigger

### Community 25 - "Drawer Panel Components"
Cohesion: 0.25
Nodes (7): vaul, DrawerContent, DrawerDescription, DrawerFooter(), DrawerHeader(), DrawerOverlay, DrawerTitle

### Community 26 - "Extension Background Coordination"
Cohesion: 0.50
Nodes (6): getServer(), inTab(), pickElement(), run(), saveRule(), setState()

### Community 27 - "Breadcrumb Navigation"
Cohesion: 0.25
Nodes (7): Breadcrumb, BreadcrumbEllipsis(), BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator()

### Community 28 - "Linting Configuration"
Cohesion: 0.29
Nodes (6): @eslint/js, eslint-plugin-prettier, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, typescript-eslint

### Community 30 - "Saved Rule Reapplication"
Cohesion: 0.73
Nodes (5): activeRules(), applyAll(), load(), observe(), schedule()

### Community 31 - "Extension Popup State"
Cohesion: 0.80
Nodes (5): init(), refreshTab(), render(), renderSaved(), run()

### Community 32 - "DOM Operation Tests"
Cohesion: 0.33
Nodes (4): baseSort, NOW, Op, PW

### Community 33 - "Tabbed UI Components"
Cohesion: 0.40
Nodes (4): @radix-ui/react-tabs, TabsContent, TabsList, TabsTrigger

### Community 34 - "Alert Presentation"
Cohesion: 0.50
Nodes (4): Alert, AlertDescription, AlertTitle, alertVariants

## Knowledge Gaps
- **40 isolated node(s):** `@ai-sdk/openai`, `@hookform/resolvers`, `@tailwindcss/vite`, `@tanstack/router-plugin`, `ai` (+35 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 314 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Shared UI Primitives` to `Public APIs and Planning`, `Tabbed UI Components`, `Alert Presentation`, `Sidebar and Panel Controls`, `Cards and Context Menus`, `Package Metadata and Dependencies`, `Buttons Dialogs and Pagination`, `Navigation Badges and Toggles`, `Command Palette Dialogs`, `Form Selection Controls`, `Menubar Components`, `Carousel Interaction`, `Form Field Context`, `Landing Page Demonstration`, `Chart Presentation`, `Select Menu Components`, `Drawer Panel Components`, `Breadcrumb Navigation`?**
  _High betweenness centrality (0.137) - this node is a cross-community bridge._
- **What connects `@ai-sdk/openai`, `@hookform/resolvers`, `@tailwindcss/vite` to the rest of the system?**
  _40 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Public APIs and Planning` be split into smaller, more focused modules?**
  _Cohesion score 0.050980392156862744 - nodes in this community are weakly interconnected._
- **Why does `cn()` connect `Cards and Context Menus` to `Tabbed UI Components`, `Alert Presentation`, `Sidebar and Panel Controls`, `Shared UI Primitives`, `Buttons Dialogs and Pagination`, `Navigation Badges and Toggles`, `Command Palette Dialogs`, `Form Selection Controls`, `Menubar Components`, `Carousel Interaction`, `Form Field Context`, `Chart Presentation`, `Select Menu Components`, `Drawer Panel Components`, `Breadcrumb Navigation`?**
  _High betweenness centrality (0.131) - this node is a cross-community bridge._
- **Should `Authentication and Server Runtime` be split into smaller, more focused modules?**
  _Cohesion score 0.05513784461152882 - nodes in this community are weakly interconnected._
- **Why does `dependencies` connect `Application Dependency Catalog` to `Package Metadata and Dependencies`?**
  _High betweenness centrality (0.104) - this node is a cross-community bridge._
- **Should `Application Dependency Catalog` be split into smaller, more focused modules?**
  _Cohesion score 0.03571428571428571 - nodes in this community are weakly interconnected._

## Extraction Coverage and Graph Health
- `.env` was skipped as sensitive; its contents were not extracted.
- Three SQL migrations could not be parsed because `tree_sitter_sql` is not installed: `drizzle/migrations/0000_migration.sql`, `0001_migration.sql`, and `0002_migration.sql`.
- Five additional data/config JSON files yielded no graph nodes; see `coverage.json` for the exact paths. Some source files yield only file nodes, so presence in the graph does not imply complete symbol coverage.
- Integrity diagnostics: 6 dangling-endpoint edges, 0 missing-endpoint edges, 5 self-loops, 5 external-reference edges, 46 directed same-endpoint collapses, and 49 undirected same-endpoint collapses. This build uses the default undirected graph. Paths and relation details may be incomplete; see `graph-health.json`.
- Low cohesion describes the extracted graph and does not by itself demonstrate that source modules should be split.
- Benchmark estimate: 819 nodes, 1,484 edges, ~1,004 tokens/query, 54.4x estimated reduction. Per-question reductions: authentication 82.9x; main entry point 33.3x; data-to-API connection 34.0x; core abstractions 496.4x. The benchmark rescanned 40,950 words, whereas initial detection counted 31,448 words; treat these as tool estimates, not measured savings.

## Working Tree
`graphify-out/` was written into the working tree and is currently untracked. You can add it to `.gitignore`, or commit only the outputs the team should share; see https://docs.graphify.com/guides/team-workflows. No application or extension files were changed.
