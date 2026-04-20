# AE Estimates

Two pre-contract estimating tools for a residential architecture + engineering firm (Okkem Design). Pure static site — vanilla HTML/CSS/JS, no build step, no framework. Deployed via GitHub Pages from `master` at https://chris-okkem.github.io/AE-Estimates/.

Chris is the user — a licensed residential structural engineer running an A/E practice. Treat his hour estimates, rate ratios, and scope judgments as authoritative.

---

## File layout

```
/AE Estimates/
├── index.html          Landing page with two tiles (no tool logic)
├── se.html             SE Estimate page
├── ae.html             A/E Estimate page
├── styles.css          Shared styles
├── se-estimate.js      SE tool (self-initializes on page load)
├── ae-config.js        A/E config defaults, curve math, grade derivation,
│                       piecewise-linear fee schedule, localStorage I/O
├── ae-estimate.js      A/E tool (self-initializes, big file)
└── ae-settings.js      A/E settings modal (loaded before ae-estimate.js)
```

Each page loads only its own JS. The nav at the top of every page uses `<a>` anchors, not in-page tab switching. App.js was removed during the multi-page refactor (Phase A).

---

## SE Estimate (se.html / se-estimate.js)

Residential structural engineering hours + fee from plan geometry.

### Inputs
- Stories (1–4)
- Per-layer corner counts (slab + each story's ceiling/floor); multiple outlines per layer
- Pier & beam toggle + its own corner outlines
- Roof count, foundation levels, roof levels
- Concrete details (minor ≤6ft @ 3h, major >6ft @ 6h, plus manual)
- Modifiers: discontinuities, long spans, vault zones, plate-height sets, voids, cantilevers, specialty details
- Lateral analysis toggle + problematic brace lines per level
- Total sq ft, target $/hr

### Key algorithm
- **Corners → squares**: `squares = (corners / 2) - 1` per outline, summed per layer
- **Base hours**: 4 setup + (levels × 1 + sq × 1) foundation + 3 × framing sq + 2 × P&B sq + (levels + count × 2) roof + concrete
- **Lateral**: stories × 3 + 4 × Σ(weighted problem lines). Weights: L1 1.0, L2 1.5, L3 2.0, L4 2.5
- **Modifiers**: discontinuities × 4, spans 16–24 × 2, spans >24 × 6, vaults × 3, (plate sets − 1) × 2, voids × 2, cantilevers × 2, specialty manual
- **Coordination multiplier**: `sqft × 0.00001 + 1` (replaced old liability multiplier — not linear scaling of engineering hours; just a gentle coordination premium for bigger projects)

### Export/Import
- v3 envelope: `{ version: 3, tool: "se", name, date, state }`. Accepts v1/v2/v3 with migration.
- SE file pasted on A/E page → friendly "open it on the other page" alert.

### Email modal
Output has Generate Email button. Opens a modal for feasibility fee, CA allowance, and turnaround weeks. Produces an inline-styled email HTML that pastes cleanly into Gmail.

---

## A/E Estimate (ae.html)

Architecture + engineering full-scope fee estimator.

### Two-stage calculation (see `calculate()` in ae-estimate.js)

**Stage 1 — construction cost:**
1. Build grade baseline: only **Builder Grade conditioned $/sf** is user-editable in settings (default $200). All other grades derive via hardcoded ratios + markup stack in `ae-config.js`:
   - Ratios: Builder 1.00 / Mid 1.40 / High 1.90 / Luxury 2.60 / Ultra 3.75
   - Markups: 1.17 / 1.20 / 1.23 / 1.25 / 1.28
   - Unconditioned = 0.54 × conditioned per grade
   - Helper: `aeConfig.deriveBuildGrades(builderBase)`
2. Adjusted rates = baseline × structural mult × size mult × density mult × **regional multiplier (per-project)**
3. Construction cost = Σ over areas (cond sf × cond rate + uncond sf × uncond rate)

**Stage 2 — fee distribution:**
1. Fee % from AIA-style matrix (7 building categories × 7 cost brackets), multiplied by project complexity factor (Simple 0.85 / Normal 1.00 / Complex 1.15) and a global **schedule factor** (per-project, default 0.5 — tuning knob).
2. **The fee table is architect-only.** No structural carve-out — the table value IS the architect's fee. Structural fee is computed separately and adds on top via the Structural section lines.
3. Architect share distributes across phases: Feasibility/Concept 15% + SD 15% + DD 20% + CD total 40% + Bidding 5% + Design CA 20%. Total = 1.15 (Feasibility is a +15% add-on).
4. **DD scales with CD inclusion**. If Construction Set unchecked, DD is halved. If Bid Set also unchecked, DD = 0. Weights in `designDevelopmentCdSplit` default to `{ permit: 0.25, bid: 0.25, construction: 0.50 }`.
5. **CA scales with CD inclusion** similarly (applies to both Design CA and Structural CA). Defaults `{ permit: 0, bid: 0.5, construction: 0.5 }` — no CDs → no CA.
6. **Permit Set** value = base × (`permitSetBaseFactor` + Σ active flag adders). Default base 0.8; flags add to it. No flags = 80%. Regulatory flags only have `permitSetAdder` (no city adder).
7. **City Comment Revisions** = permit set × `cityCommentsPctOfPermitSet` (default 0.25). Replaced older architect-share-based calc.

### State model

```js
state = {
  identity: { projectAddress, clientName },       // per-project
  programItems: [ { id, text } ],                 // per-project narrative list
  program: {                                       // DEFAULT-ABLE
    scopes: [ { id, name, type, cond*, uncond* } ],
    buildGrade, structuralComplexity,
    buildingCategory, projectComplexity,
    regionalMultiplier,
  },
  stage1Overrides: { conditionedRate, unconditionedRate, constructionCost }, // per-project
  stage2: { activeFlags: [] },                     // per-project
  manualHours: { site_visit, scan, base_model, as_builts, permit_submittals }, // per-project
  additionalServices: [ { id, label, rate, hours, dollars } ], // per-project
  lineOverrides: { [lineId]: { hours? | dollars? } }, // per-project
  lineExclusions: { [lineId]: true },              // DEFAULT-ABLE (user asked for this to be)
  config: null,                                    // per-project snapshot of settings
};
```

### Defaults lifecycle

Two separate localStorage keys, two parallel mechanisms:

**Estimate-side defaults (`aeProgramDefaults`):**
- Default-able fields: `program.*` + `lineExclusions`
- Page load: `loadEffectiveProgramDefaults()` merges saved with shipped (shipped values fill in any missing fields)
- **Save as Default** writes current default-able subset to localStorage
- **Reset to Defaults** restores from localStorage (NOT shipped — user explicitly wanted this)
- **New Project** clears per-project work and reloads defaults
- Shipped defaults are the developer's responsibility (in `shippedProgramDefaults()`); no UI to reach them directly except Settings → Regulatory Flags → "Load shipped flags" which replaces just the flags list

**Settings (`aeConfig` + `aeConfigBackups`):**
- Holds curves, multipliers, splits, rates, fee schedule, regulatory flag list, etc.
- Each project has its own `state.config` snapshot — the inline Fee Schedule Factor is per-project
- Settings modal Save as Default writes to localStorage; last 20 backups auto-rotated
- Settings export/import (standalone JSON) from within the modal
- `aeConfig.normalizeConfig()` in `ae-estimate.js` strips legacy fields on load (buildGrades, cityCommentsBasePct, city adders, feasibility rate, etc.)

**BeforeUnload guard** fires if:
- Per-project work has changed since last Export Estimate, OR
- Default-able fields (including line exclusions) drift from saved defaults

Either Save as Default or Export Estimate clears the relevant trigger.

### Export envelope (A/E)

`{ version: 3, tool: "ae", name, date, state }` — where `state` includes `state.config`, so settings travel with the project. V2 files (pre-multi-page) migrate via `setState`; older files with `projectName` or flat sf/spaces fields are migrated on load.

### UI quirks

- **Per-area type toggle** (Remodel / Addition / New) — organizational only, doesn't affect calc. Used in the proposal to group areas.
- **Per-line include/exclude checkbox** — excluded lines still render (strikethrough, "not included" badge) but don't count toward totals. Now default-able.
- **Inline Fee Schedule Factor input** on the form writes to `state.config.feeSchedule.factor` (per-project, not localStorage). Use Settings → Save as Default to persist.
- **Settings modal**: full-screen overlay. Apply/Save stay open (with "Applied"/"Saved" button flash). Close has unsaved-changes guard.

---

## Settings UI sections (`ae-settings.js`)

- **Default Hourly Rates** — per-line hourly rates
- **Build Grades** — single Builder Base input + read-only preview of derived rates
- **Structural Multipliers** — Stage 1 (cost) and Stage 2 (fee) tables, medium locked
- **Size Curve** / **Density Curves** — 3-anchor editors + interactive SVG plots (hover tooltip follows cursor, anchor dots have tooltips, test-input field)
- **Phase Weights** — 6 inputs + running sum (no warning badge per user)
- **CD Sub-Level Split** — Permit/Bid/Construction CD dollar distribution (22/33/45 default)
- **DD CD Split** — how DD scales with CD inclusion (25/25/50 default)
- **CA CD Split** — how CA scales with CD inclusion (0/0.5/0.5 default)
- **Structural Settings** — share, totalRate, design/CA portions
- **City Comments % of Permit Set** — single input (default 0.25)
- **Regulatory Flags** — editable table; each flag has id, label, permitSetAdder. Permit Set base factor input above the table. "Load shipped flags" button replaces just this section.

The **Fee Schedule editor is intentionally not exposed** — the hardcoded AIA matrix stays as-is; only the global factor knob is tunable (per-project).

### Curve math

Both size and density curves **extrapolate past outer anchors** (no clamping). Size curve has a 0.75 floor to prevent runaway extrapolation. Density curves are linear on each side; size curve uses `progress^1.5` on the small side and linear on the large side.

---

## Generate Proposal (`ae-estimate.js`)

Produces a formatted HTML proposal that pastes cleanly into Google Docs (matches Chris's existing template).

### Modal inputs
- Proposed scope phrase (e.g., "major remodel and second-story addition")
- Six phase durations (weeks): PD, SD, Permit, SE, Bid, CD
- Retainer amount (number, rendered as `$X,XXX` in bold)
- Your name / firm signature

Project address, client, program items, areas, and fee breakdown come from the form state.

### Output structure
- **Starts at "1. PROJECT DESCRIPTION"** — no title, no header block (per user)
- Arial 11pt on every element including h1s (Google Docs respects inline `font-size` on heading tags)
- Headings have explicit `margin-left: 0; padding-left: 0; text-indent: 0` to prevent Docs from inheriting indentation from preceding `<ul>`
- Phase descriptions inline with em-dash (`**Pre-Design —** Establish the foundation...`); imperative voice
- Scope-of-Services bullets substitute "not in scope" for the description when the corresponding estimate line is excluded or has zero dollars (`inScope()` helper)
- Area assumption bullets only appear for types that have scopes
- Fee table: section header row shows subtotal hours + fee inline (no separate subtotal row); line items indented below; final bold "Total Design Fee" row with 2px top border and `$X,XXX (+/- 10%)`
- Structural CA called out as a separate service with its dollar amount in bold
- **No Terms & Conditions** (removed per user)
- Whitespace tight (`line-height: 1.2`, `margin: 0 0 3pt 0` on body elements, `margin: 10pt 0 3pt 0` on headings)

### Clipboard
Uses `navigator.clipboard.write` with `ClipboardItem` containing both `text/html` and `text/plain` blobs. Fallback to `document.execCommand('copy')` via selection range.

---

## GitHub Pages

- Deployed from `master` branch root. Push → ~30s to build → live.
- Chris's own website embeds/iframes the GitHub Pages URL. When iframing the root it now shows the landing page; individual tools live at `/se.html` and `/ae.html`.
- Caching is aggressive. Hard refresh (Ctrl+Shift+R) after every push. For really stale caches, clear site data in DevTools.

---

## Non-obvious decisions / history

- **AIA table is architect-only.** No structural carve-out in the architect phase distribution. Structural fees are separate line items that add on top. (Earlier versions subtracted structural — that was wrong.)
- **Build Grades derive from one Builder Base.** Avoids 10 numbers to tune. Chris picked ratios and markups that reflect his market's reality; they're hardcoded constants, not config.
- **The fee schedule factor is the main tuning knob** for the whole estimate. Default 0.5 reflects Chris's current calibration for his market.
- **Line exclusions are default-able.** Originally per-project, but Chris asked for them to persist because his typical scope (e.g., rarely does Bid Sets) can be encoded as defaults.
- **Reset to Defaults loads last-saved defaults, not shipped.** Shipped defaults are the developer's job — user never sees a "load shipped" button except for the Regulatory Flags section, because that's the one list that grows as Chris adds new jurisdictional flags.
- **Scope types (Remodel/Addition/New) are organizational.** Don't affect calc; used only in the proposal to group area assumption bullets.
- **DD and CA scale with CD inclusion.** Mirrors real workflow: if you're not doing full CDs, you're not doing full DD or full CA. Splits are configurable.
- **Permit Set base factor is 0.8, not 1.0.** Interpretation: baseline permit work is 80% of its CD-split allocation; regulatory flags add real complications on top.
- **Proposal paste-into-Google-Docs fidelity** is the whole reason for inline styles everywhere. Don't refactor to classes.

---

## Memory
Per-user memories live under `C:\Users\chris\.claude\projects\c--Users-chris-OneDrive-Desktop-Claude-Projects-AE-Estimates\memory\`. That directory already has entries about Chris's role, preferred discussion style, GitHub Pages setup, and the coordination multiplier rationale.
