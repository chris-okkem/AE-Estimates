# AE Estimates — Platform Documentation

A pre-contract fee-estimating suite for **Okkem Design** (Austin, TX).
Two tools: a structural-engineering-only estimator (SE) and a full
architecture + engineering estimator (A/E). Pure static site, hosted on
GitHub Pages at <https://chris-okkem.github.io/AE-Estimates/>.

---

## 1. What's in the platform

| Tool | URL | Purpose |
|---|---|---|
| **Landing page** | `/` | Two tiles linking to the two tools |
| **SE Estimate** | `/se.html` | Structural-engineering-only fee estimator |
| **A/E Estimate** | `/ae.html` | Full architecture + engineering fee estimator |

Both tools produce:
- A line-itemized fee estimate with editable hours and dollars
- A formatted proposal that pastes cleanly into Google Docs
- An export/import path for round-tripping projects as JSON

Built with vanilla HTML / CSS / JavaScript — no framework, no build
step. Push to the `master` branch, GitHub Pages rebuilds in ~30 seconds,
and the change is live.

---

## 2. File layout

```
/AE Estimates/
├── index.html          Landing page (two tiles)
├── se.html             SE Estimate page
├── ae.html             A/E Estimate page
├── styles.css          Shared styles
├── se-estimate.js      SE tool — calc engine, form, proposal
├── ae-config.js        A/E shipped defaults + curve math + fee schedule
├── ae-estimate.js      A/E tool — calc engine, form, proposal
├── ae-settings.js      A/E settings modal (view-only)
├── CLAUDE.md           Developer-side notes for AI assistants
└── PLATFORM.md         This file
```

Each page loads only the JS it needs, so the SE tool doesn't pay for
A/E's bigger footprint. Settings ship as code — there is no save-to-
localStorage path for config (we tried that and it ate hours of
calibration when localStorage got cleared; now any change has to be
committed to the repo).

---

## 3. SE Estimate — Algorithm

The SE tool turns plan geometry into engineering hours and a fee.

### Inputs

| Section | Field |
|---|---|
| **Project** | Project Address, Client Name, Structures & Scope items |
| **Project Assumptions** | Design Stability · Gravity System · Lateral System · Project Type · Foundation Type · Geotech Report · Truss Package |
| **Base Geometry** | Stories · per-layer outline corner counts (slab + each story ceiling/floor) · Total Square Footage · Target $/Hour |
| **Roof & Foundation Levels** | Roof count · foundation level count · roof level count |
| **Concrete Details** | Minor / Major / Manual line items |
| **Pier & Beam** | Toggle + per-outline corner counts |
| **Discontinuities** | Count of bearing-wall offsets between stories |
| **Long-Span Counts** | Spans 16–24 ft · spans >24 ft |
| **Section-Driven Complexity** | Vault zones · plate-height sets · voids/penetrations · cantilever areas |
| **Lateral Analysis** | Lateral required y/n · per-level problematic brace lines |
| **Specialty Details** | Manual hour entries for unusual scope |

### Calculation steps (10 stages)

#### Step 1 — Convert corners to squares

Per outline:

```
squares = max((corners ÷ 2) − 1, 0)
```

Squares are summed per layer, then collected into:

- **Foundation squares** = slab-layer squares
- **Framing squares** = sum of all per-story ceiling/floor layers
- **Pier & beam squares** = sum of P&B outlines (when enabled)

#### Step 2 — Base hours

```
foundation_hours = foundation_levels × 1
                 + tapered_sq(foundation_squares)

  where tapered_sq(n) =
        1.05·n − 0.05·n²            for n ≤ 8
        5.2 + 0.25·(n − 8)          for n  > 8

framing_hours    = framing_squares × 3
P&B_hours        = pb_squares × 2          (when P&B enabled)
roof_hours       = roof_levels × 1 + roof_count × 1
concrete_hours   = 3 × minor + 6 × major + Σ manual
```

The foundation taper reflects the reality that you size one grade
beam and reuse the detail; the marginal cost of additional foundation
squares falls fast and floors at 0.25 hr/sq.

#### Step 3 — Lateral hours

```
lateral_base    = stories × 3
weighted_sum    = L1×1.0 + L2×1.2 + L3×1.3 + L4×1.4
                  (weights skip levels that don't exist)
lateral_hours   = lateral_base + 3 × weighted_sum
```

`L1..L4` are user-entered counts of "problematic brace lines" — wall
lines that resist lateral load but are interrupted by openings.

#### Step 4 — Modifier hours

```
discontinuities  = count × 3
spans 16–24      = count × 2
spans >24        = count × 6
vault zones      = count × 3
plate-height     = max(sets − 1, 0) × 1
voids            = count × 2
cantilevers      = count × 3
specialty        = Σ manual hours
```

Total **modifier_hours** = sum of all the above + lateral_hours
(lateral is folded into the modifier total for display reasons).

#### Step 5 — System complexity factors

Each option in the Gravity System and Lateral System dropdowns
carries a `factor` that scales only the work it represents:

- **Gravity factor** scales framing + P&B + roof + non-lateral modifiers
- **Lateral factor** scales lateral hours only
- Foundation and concrete details are NOT multiplied (foundation has its
  own complexity inputs; concrete details are per-event counted, and any
  unusual foundation thrust-tie work on a PEMB-style project is captured
  by the user adding more major-concrete-details rather than baking it
  into the gravity factor)

```
Gravity factors:
  Light Wood Framing                  1.00
  Heavy Timber / Mass Timber          1.40
  Cold-Formed Steel Framing           1.30
  Structural Steel Framing            1.40
  Concrete Framing                    1.50
  Precast / Tilt-Up Concrete          1.45
  Masonry / CMU Bearing Wall          1.30
  PEMB / Metal Building System        0.70   ← below 1.00; manufacturer
                                              handles framing, engineer
                                              just designs foundation +
                                              connections
  Hybrid / Mixed Gravity System       1.50

Lateral factors:
  Wood Shear Wall                     1.00
  Cold-Formed Steel Shear Wall        1.25
  Steel Moment Frame / Portal Frame   1.45
  Steel Braced Frame                  1.30
  Concrete Shear Wall / Core          1.45
  Masonry / CMU Shear Wall            1.35
  Tilt-Up / Precast Shear Wall        1.40
  Diaphragm / Collector-Heavy         1.50
  Hybrid / Mixed Lateral              1.60

non_lateral_modifiers = modifier_hours − lateral_hours
gravity_scope = framing_hours + P&B_hours + roof_hours
              + non_lateral_modifiers
adjusted_gravity = gravity_scope × gravity_factor
adjusted_lateral = lateral_hours × lateral_factor
```

#### Step 6 — Raw work

```
raw_work = foundation_hours
         + concrete_hours
         + adjusted_gravity
         + adjusted_lateral
```

This is the "pure" engineering effort — what an engineer of record
spends on calc, beam sizing, detailing, and lateral analysis, with
nothing else stacked on yet.

#### Step 7 — Setup & standard coordination

```
levels_total = foundation_levels + stories + roof_levels
geometric_raw = foundation_hours + framing_hours + P&B_hours + roof_hours

setup_hours = 1.5 fixed                       ← cover sheet, general
            + 0.5 × levels_total                notes, design criteria
            + 0.10 × geometric_raw            ← Revit modeling effort
                                                scales with sheets and
                                                wall tracing

coordination_multiplier = 1 + (square_footage × 0.00001)
coordination_pct        = 0.10 × coordination_multiplier
coordination_hours      = coordination_pct × raw_work
```

The coordination multiplier exists to catch the "10,000 sf rectangle"
case — geometrically simple but physically large buildings under-
counted by the squares model. It scales the standard-coordination
percentage rather than the raw work itself.

#### Step 8 — Sealed Structural Set

```
sealed_set_hours = raw_work + setup_hours + coordination_hours
sealed_set_fee   = sealed_set_hours × rate
```

This is the "Sealed Structural Set" line item — the deliverable.

#### Step 9 — Pre-Design + Design Coordination (auto-populated)

Four line items get hours and an included flag based on Project Type
and Design Stability:

| Line | Hours | Included default |
|---|---|---|
| **Site Visit / Assessment** | flat 2.5 hr | checked if Project Type is Addition or Remodel |
| **Preliminary Review & Feasibility** | max(raw × 5%, 0.5 hr) | always checked |
| **Design Coordination** | sealed_set × 20% | checked if Design Stability is Mostly Locked or Fluid |
| **Early Design Assist** | sealed_set × 20% | checked if Design Stability is Fluid |

User can override hours/dollars/included on any line; the next Calculate
re-overwrites with the auto-populated values.

#### Step 10 — Construction Phase Services (auto-populated)

CA % is additive across three independent axes, clamped at 35%:

```
CA% = 10% base
    + gravity CA modifier   (0–8%)
    + lateral CA modifier   (0–8%)
    + project-type modifier (0% / 3% / 6% for New / Addition / Remodel)
CA% = min(CA%, 35%)

CA_total = raw_work × CA%
```

Distribution into three line items, with floors:

```
Structural Observation = max(CA_total × 50%, 6 hr)
RFI Response           = max(CA_total × 40%, 4 hr)
Submittal Review       = max(CA_total × 10%, 2 hr)   if shop drawings
                       = 0                           otherwise
```

**Shop drawings logic:**

```
shop_drawings = (gravity_system ≠ Light Wood Framing)
                OR (gravity_system = Light Wood Framing AND truss_package = yes)
```

Every gravity system except light wood is assumed to have shop
drawings (steel members, concrete rebar, mass-timber panels, CMU
schedules, PEMB drawings). For light wood, the Truss Package
dropdown decides — truss packages are submittal-review events even
on conventional wood projects.

### Final fee

```
total_fee = Σ (included line item hours × rate)
          = sealed_set_fee
          + Σ (any pre-design lines that are included)
          + Σ (CA lines that are included)
          + any user-added manual entries
```

---

## 4. A/E Estimate — Algorithm

Two-stage calc. Stage 1 turns building program into a construction cost;
Stage 2 turns construction cost into an architect fee.

### Inputs

| Section | Field |
|---|---|
| **Project** | Project Address, Client Name |
| **Program** | Narrative items (free-text bullets) |
| **Areas (Scopes)** | One or more: name, type (Remodel / Addition / New Construction), conditioned sf, conditioned spaces, unconditioned sf, unconditioned spaces |
| **Stage 1** | Build Grade · Structural Complexity · Building Category · Project Complexity · Regional Multiplier |
| **Stage 2** | Fee Schedule Factor · Regulatory Flags · per-line include/exclude toggles |

### Stage 1 — Construction cost

```
For each scope:
  cond_baseline   = BUILD_GRADE_CONDITIONED[grade]
  uncond_baseline = cond_baseline × 0.54

Build grades (national-average $/sf, including builder overhead/profit):
  Builder        $150
  Mid Custom     $200
  High Custom    $300
  Luxury         $450
  Ultra          $675

Multipliers applied to baseline:
  structural_mult_stage1 (Low/Med/High → 0.75 / 1.00 / 1.25)
  size_mult              (3-anchor curve on total sf)
  density_mult_cond      (3-anchor curve on cond_spaces / cond_sf × 1000)
  density_mult_uncond    (3-anchor curve on uncond_spaces / uncond_sf × 1000)
  regional_mult          (default 1.15 for Austin)

calc_cond_rate   = cond_baseline   × structural × size × density_cond   × regional
calc_uncond_rate = uncond_baseline × structural × size × density_uncond × regional

construction_cost = Σ (cond_sf × calc_cond_rate
                     + uncond_sf × calc_uncond_rate)
```

### Stage 2 — Architect fee

```
fee_pct = AIA_schedule[building_category][cost_bracket]
        × project_complexity_factor    (Simple/Normal/Complex → 0.85/1.00/1.15)
        × schedule_factor              (default 0.50 — the master tuning knob)

architect_share_raw = construction_cost × fee_pct

architect_share = max(architect_share_raw, architect_minimum_fee)
                                            (default $12,250)
```

The minimum fee floor catches small-cost projects where the AIA
schedule under-counts (the table tops out at ~14% even for custom
residences, which is too thin below ~$140K construction cost).

### Phase distribution

`architect_share` flows into named phase lines:

```
Phase weights (sum to 1.15; Feasibility is +15% on top of base):
  Feasibility / Concept              15%
  Schematic Design                   15%
  Design Development                 20%
  Construction Documents (total)     40%
    Permit Set        22% of CD total
    Bid Set           33% of CD total
    Construction Set  45% of CD total
  Bidding / Negotiation               5%
  Design Services (Design CA)        20%
```

**DD scales with CD inclusion** (default split 25/25/50 across
permit/bid/construction). Excluding a CD sub-level reduces DD
proportionally.

**CA scales with CD inclusion** (default split 0/50/50). Permit-only
projects get zero CA; permit+bid gets half CA.

### Permit Set sizing

```
permit_set_dollars = (CD_total × 22%) × (0.8 + Σ active flag adders)
```

The 0.8 base factor reflects that the permit-only baseline is 80% of
its CD-split allocation; active flags add work back. All 8 shipped
flags (Subchapter F, Protected trees, Historic district, Hillside,
Floodplain, Water quality overlay, Wildlife Urban Interface,
Visitability plan) carry a 10% adder each.

### City Comment Revisions

```
city_comments = permit_set_dollars × 25%
```

### Structural fees

Architect-only fee schedule. Structural fees are computed separately
and added on top:

```
total_structural_fee = construction_cost
                     × structural_share         (60%)
                     × structural_total_rate    (1.5%)
                     × structural_mult_stage2

Structural Engineering line  = total_structural_fee × 80%
Structural Services line     = total_structural_fee × 20% × CA_weight
```

### Final fee

Sum of every included line item, plus the structural lines, plus any
user-added Additional Services. The grand-total bar shows total hours
and dollars; the proposal generator reads from these line items.

---

## 5. Settings — view only

Both tools' configuration lives in code. The A/E Settings modal is a
**read-only viewer** — every section shows the current shipped values
but inputs are locked. There is no Save / Apply / Reset / Import
button. Any change to defaults (curves, flags, percentages, etc.) has
to be committed to the repo.

This is by design. An earlier version persisted settings to browser
localStorage, but localStorage can be cleared without warning (browser
cleanup, extensions, switching browsers), and we lost hours of
calibration work that way more than once. Defaults-as-code eliminates
that failure mode.

The estimate-side **program defaults** (typical project parameters
like Build Grade, Structural Complexity, line exclusions) still
persist to localStorage via the form's "Save as Default" /
"Reset to Defaults" buttons. Those are recoverable inputs (you re-
select Mid Custom in 2 seconds), not multi-hour calibration work.

---

## 6. Per-project export / import

Each tool's "Export Estimate" button downloads a JSON file containing
the full project state plus a snapshot of the active config:

```
{
  "version": 3,
  "tool": "se" or "ae",
  "name": "<project name>",
  "date": "<ISO timestamp>",
  "state": { ...full project state... }
}
```

Importing a `.json` on the wrong tool's page (e.g., an SE file on the
A/E page) shows a friendly "open it on the other page" message. Older
v1/v2 envelope formats are migrated transparently.

---

## 7. Generate Proposal

Both tools include a "Generate Proposal" button that produces a
formatted HTML proposal mirroring Chris's Google Doc template. Inline
CSS preserves formatting on paste into Google Docs.

Proposal flow:

1. Click Generate Proposal → modal asks for proposed scope, week
   durations, retainer amount, round-hours toggle (and CA fee
   override on SE)
2. Tool reads from current state + line items
3. Modal opens a preview with a Copy to Clipboard button
4. Paste into Google Docs

The proposal automatically:
- Renders the program / structures-and-scope as bullet lists
- Renders the Project Assumptions block from the dropdowns
- Builds the fee table from included line items grouped by phase
- Substitutes "not in scope" for excluded scope-of-services bullets
  (A/E only)
- Tracks the +/-10% completion guarantee paragraph
- Closes with the standard hourly rate schedule and payment terms

---

## 8. Deployment

Every push to the `master` branch on
<https://github.com/chris-okkem/AE-Estimates> triggers a GitHub Pages
rebuild. The site is live at
<https://chris-okkem.github.io/AE-Estimates/> within ~30 seconds.

Browser caching is aggressive — after a push, do a hard refresh
(Ctrl+Shift+R) to guarantee you're seeing the latest version.

---

## 9. Key design decisions worth knowing

- **Settings are shipped-only.** Curves, flags, multipliers, splits,
  percentages all live in code. Repo is the source of truth.
- **No backend.** Everything runs in the browser. No login, no
  database, no server.
- **The fee schedule is architect-only.** Structural fees are computed
  separately and add on top. There is no structural carve-out from the
  AIA table.
- **DD and CA scale with CD inclusion.** Real workflow — if you're not
  doing full CDs, you're not doing full DD or full CA.
- **Permit Set base factor is 0.8, not 1.0.** Baseline permit work is
  80% of its CD-split allocation; flags add back on top.
- **Build grade $/sf are hardcoded national averages.** Includes
  builder overhead/profit. Regional adjustment is a separate per-
  project knob.
- **SE foundation hours taper.** First square is 1.0 hr; each
  additional square drops 0.1 hr; floors at 0.25 hr/sq.
- **Gravity / lateral system factors apply only to their respective
  scopes.** Gravity → framing/roof/non-lateral modifiers; lateral →
  lateral hours only. They never multiply each other.
- **CA distribution is 50/40/10** (observation/RFI/submittal) for
  residential. Higher RFI weight reflects field-condition reality.
  Submittal drops to 0 when there are no shop drawings.
- **Coordination multiplier scales the standard-coordination
  percentage, not raw work itself.** A 10,000-sf rectangular box gets
  more coordination effort even though its squares-model count is
  small.

---

## 10. Where to look for what

| Question | File |
|---|---|
| How is a foundation hour computed? | `se-estimate.js` → `calculateAndRender()` |
| What's the AIA fee table? | `ae-config.js` → `DEFAULT_CONFIG.feeSchedule` |
| Why is the curve shaped like that? | `ae-config.js` → `sizeCurveMultiplier`, `densityCurveMultiplier` |
| How do regulatory flags work? | `ae-estimate.js` → `calculate()`, search for `permitSetUpliftFactor` |
| How is the proposal HTML built? | `se-estimate.js` / `ae-estimate.js` → `buildProposalHtml()` |
| What's the line-item state shape? | `ae-estimate.js` → `LINE_ITEM_DEFS` (and `state.lineItems`); `se-estimate.js` similarly |

---

*Last updated: 2026-04-25*
