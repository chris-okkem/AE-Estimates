// SE Estimate — Residential Structural Engineering estimate module

(function () {
  const app = document.getElementById('app');

  const DESIGN_STABILITY_OPTIONS = [
    { value: 'locked',        label: 'Locked (engineer only)' },
    { value: 'mostly_locked', label: 'Mostly Locked (minor coordination)' },
    { value: 'fluid',         label: 'Fluid (early design assist)' },
  ];
  // Each option carries two numbers:
  //   factor      → multiplies design hours for the relevant scope
  //                 (gravity factor → framing + P&B + roof + non-lateral
  //                  modifiers; lateral factor → lateral hours only)
  //   caModifier  → additive contribution to the CA percentage of raw work
  //                 (accumulated across gravity + lateral + project-type
  //                  axes, clamped to 35%)
  const GRAVITY_SYSTEM_OPTIONS = [
    { value: 'light_wood_framing',  label: 'Light Wood Framing',             factor: 1.00, caModifier: 0.00 },
    { value: 'heavy_timber',        label: 'Heavy Timber / Mass Timber',     factor: 1.40, caModifier: 0.06 },
    { value: 'cold_formed_steel',   label: 'Cold-Formed Steel Framing',      factor: 1.30, caModifier: 0.04 },
    { value: 'structural_steel',    label: 'Structural Steel Framing',       factor: 1.40, caModifier: 0.06 },
    { value: 'concrete_framing',    label: 'Concrete Framing',               factor: 1.50, caModifier: 0.08 },
    { value: 'precast_tilt_up',     label: 'Precast / Tilt-Up Concrete',     factor: 1.45, caModifier: 0.08 },
    { value: 'masonry_cmu',         label: 'Masonry / CMU Bearing Wall',     factor: 1.30, caModifier: 0.06 },
    { value: 'pemb',                label: 'PEMB / Metal Building System',   factor: 0.70, caModifier: 0.04 },
    { value: 'hybrid_gravity',      label: 'Hybrid / Mixed Gravity System',  factor: 1.50, caModifier: 0.08 },
  ];
  const LATERAL_SYSTEM_OPTIONS = [
    { value: 'wood_shear_wall',     label: 'Wood Braced Wall / Wood Shear Wall',         factor: 1.00, caModifier: 0.00 },
    { value: 'cfs_shear_wall',      label: 'Cold-Formed Steel Shear Wall / Strap Bracing', factor: 1.25, caModifier: 0.04 },
    { value: 'steel_moment_frame',  label: 'Steel Moment Frame / Portal Frame',          factor: 1.45, caModifier: 0.08 },
    { value: 'steel_braced_frame',  label: 'Steel Braced Frame',                         factor: 1.30, caModifier: 0.06 },
    { value: 'concrete_shear_wall', label: 'Concrete Shear Wall / Core',                 factor: 1.45, caModifier: 0.08 },
    { value: 'masonry_shear_wall',  label: 'Masonry / CMU Shear Wall',                   factor: 1.35, caModifier: 0.06 },
    { value: 'tilt_up_shear_wall',  label: 'Tilt-Up / Precast Concrete Shear Wall',      factor: 1.40, caModifier: 0.08 },
    { value: 'diaphragm_collector', label: 'Diaphragm / Collector-Heavy System',         factor: 1.50, caModifier: 0.08 },
    { value: 'hybrid_lateral',      label: 'Hybrid / Mixed Lateral System',              factor: 1.60, caModifier: 0.08 },
  ];

  const PROJECT_TYPE_OPTIONS = [
    { value: 'new_construction', label: 'New Construction', caModifier: 0.00 },
    { value: 'addition',         label: 'Addition',         caModifier: 0.03 },
    { value: 'remodel',          label: 'Remodel',          caModifier: 0.06 },
  ];

  const TRUSS_PACKAGE_OPTIONS = [
    { value: 'no',  label: 'No' },
    { value: 'yes', label: 'Yes' },
  ];

  const CA_BASE_PCT = 0.10;
  const CA_CAP_PCT  = 0.35;
  // Distribution favors RFI over submittal review for residential, where
  // RFIs (field conditions, connection clarifications) eat more time than
  // shop-drawing review. When a project has no shop drawings, the 10%
  // submittal share simply drops off — total CA bills at 90% of CA%.
  const CA_SPLIT = { observation: 0.50, rfi: 0.40, submittal: 0.10 };
  const CA_FLOORS = { observation: 6, rfi: 4, submittal: 2 };

  function gravityFactorFor(value) {
    const o = GRAVITY_SYSTEM_OPTIONS.find((x) => x.value === value);
    return o ? o.factor : 1.0;
  }
  function lateralFactorFor(value) {
    const o = LATERAL_SYSTEM_OPTIONS.find((x) => x.value === value);
    return o ? o.factor : 1.0;
  }
  function caModifierFor(options, value) {
    const o = options.find((x) => x.value === value);
    return o && typeof o.caModifier === 'number' ? o.caModifier : 0;
  }
  const FOUNDATION_TYPE_OPTIONS = [
    { value: 'slab_on_grade', label: 'Slab-on-grade' },
    { value: 'pier_beam',     label: 'Pier and beam' },
  ];
  const GEOTECH_REPORT_OPTIONS = [
    { value: 'provided',            label: 'Provided' },
    { value: 'waived_nonexpansive', label: 'Waived (non-expansive assumed)' },
    { value: 'to_be_provided',      label: 'To be provided' },
  ];

  // Engineer-rate constant. All line items bill at this rate except
  // Structural Analysis and Design, which uses the user-controlled
  // "Target $/Hour" input (default $160) — that line is a drafter-blended
  // rate since portions of the production work go to non-licensed staff.
  const RATE_ENGINEER = 190;

  // Fee line items, grouped by proposal phase. Sealed Set is auto-populated
  // by the calculator on each Calculate; all others default to 0 and are
  // user-editable (auto-population for the others lands in a later phase).
  const LINE_ITEM_DEFS = [
    { id: 'early_design_assist',        label: 'Early Design Assist',              phase: 'Pre-Design',   rate: RATE_ENGINEER },
    { id: 'site_visit',                 label: 'Site Visit / Assessment',          phase: 'Pre-Design',   rate: RATE_ENGINEER },
    { id: 'preliminary_feasibility',    label: 'Preliminary Review & Feasibility', phase: 'Pre-Design',   rate: RATE_ENGINEER },
    { id: 'design_coordination',        label: 'Design Coordination',              phase: 'Design',       rate: RATE_ENGINEER },
    { id: 'structural_analysis_design', label: 'Structural Analysis and Design',   phase: 'Design',       rate: null /* uses state.dollarPerHour */ },
    { id: 'rfi_response',               label: 'RFI Response',                     phase: 'Construction', rate: RATE_ENGINEER },
    { id: 'submittal_review',           label: 'Submittal Review',                 phase: 'Construction', rate: RATE_ENGINEER },
    { id: 'structural_observation',     label: 'Structural Observation',           phase: 'Construction', rate: RATE_ENGINEER },
  ];

  // Returns the hourly rate for a given line id. Most lines bill at
  // RATE_ENGINEER ($190); Structural Analysis and Design uses the user-
  // controlled global rate (state.dollarPerHour, default $160) since
  // production work on that line is partly drafter-blended.
  //
  // Wrapped in try/catch because this can be called from makeInitialState
  // (via makeInitialLineItems) before `state` is in scope, which would
  // otherwise throw ReferenceError thanks to `let`'s temporal dead zone.
  function rateForLine(id) {
    const def = LINE_ITEM_DEFS.find((d) => d.id === id);
    if (def && typeof def.rate === 'number') return def.rate;
    try {
      if (typeof state !== 'undefined' && state && state.dollarPerHour > 0) {
        return state.dollarPerHour;
      }
    } catch (e) { /* state in TDZ — fall through to default */ }
    return 160;
  }

  function makeInitialLineItems() {
    const out = {};
    LINE_ITEM_DEFS.forEach((d) => {
      out[d.id] = { hours: 0, dollars: 0, included: true, rate: rateForLine(d.id) };
    });
    return out;
  }

  let structureScopeIdCounter = 0;
  const nextStructureScopeId = () => 'ss_' + (++structureScopeIdCounter) + '_' + Date.now();

  let state = makeInitialState();

  function makeInitialState() {
    return {
      projectAddress: '',
      clientName: '',
      structuresScope: [],
      assumptions: {
        designStability: 'mostly_locked',
        gravitySystem: 'light_wood_framing',
        lateralSystem: 'wood_shear_wall',
        projectType: 'new_construction',
        trussPackage: 'no',
        foundationType: 'slab_on_grade',
        geotechReport: 'to_be_provided',
      },
      stories: 1,
      squareFootage: 0,
      cornerOutlines: {},
      roofCount: 1,
      foundationLevels: 1,
      roofLevels: 1,
      minorConcreteDetails: 0,
      majorConcreteDetails: 0,
      manualConcreteDetails: [],
      dollarPerHour: 160,
      discontinuities: 0,
      span16to24Count: 0,
      spanOver24Count: 0,
      vaultZones: 0,
      plateHeightSets: 1,
      voidsPenetrations: 0,
      cantileverAreas: 0,
      problematicBraceLines: { level1: 0, level2: 0, level3: 0, level4: 0 },
      specialtyDetails: [],
      pierAndBeamPresent: false,
      pierAndBeamCorners: [4],
      lateralRequired: true,
      lineItems: makeInitialLineItems(),
    };
  }

  function resetState() {
    state = makeInitialState();
    initCornerOutlines();
  }

  function getLayerKeys() {
    const keys = ['slab'];
    for (let i = 1; i <= state.stories; i++) {
      keys.push('level' + i);
    }
    return keys;
  }

  function getLayerLabel(key) {
    if (key === 'slab') return 'Slab-on-Grade';
    const num = key.replace('level', '');
    return 'Level ' + num + ' Ceiling / Floor Framing';
  }

  function initCornerOutlines() {
    const keys = getLayerKeys();
    const old = state.cornerOutlines;
    const next = {};
    keys.forEach((k) => {
      next[k] = old[k] && old[k].length > 0 ? old[k] : [4];
    });
    state.cornerOutlines = next;
  }

  function render() {
    initCornerOutlines();
    rebuildForm();
  }

  function rebuildForm() {
    const layers = getLayerKeys();

    app.innerHTML = `
      <div class="estimate-form">
        <div class="form-header">
          <h2>SE Estimate</h2>
          <button class="btn btn-secondary" id="btnImport">Import Estimate</button>
        </div>

        <!-- Project -->
        <div class="form-section">
          <div class="form-row">
            <div class="form-group" style="flex: 1;">
              <label for="projectAddress">Project Address</label>
              <input type="text" id="projectAddress" placeholder="e.g. 123 Main St" value="${escapeAttr(state.projectAddress)}">
            </div>
            <div class="form-group" style="flex: 1;">
              <label for="clientName">Client Name</label>
              <input type="text" id="clientName" placeholder="e.g. Smith Residence" value="${escapeAttr(state.clientName)}">
            </div>
          </div>

          <h3 style="margin-top:1rem;">Structures &amp; Scope</h3>
          <p class="help-text">List each structure and the engineering scope it covers. Each item becomes a bullet in the proposal.</p>
          <div id="structuresScopeList">
            ${(state.structuresScope || []).map((item, idx) => `
              <div class="form-row structures-scope-row" data-idx="${idx}">
                <div class="form-group" style="flex:1">
                  <input type="text" class="structures-scope-input" data-idx="${idx}" placeholder="e.g. Main residence — foundation, framing, lateral" value="${escapeAttr(item.text || '')}">
                </div>
                <div class="form-group" style="flex:0; align-self:flex-end;">
                  <button class="btn-remove-structure" data-idx="${idx}" title="Remove">&times;</button>
                </div>
              </div>
            `).join('')}
          </div>
          <button class="btn-small" id="btnAddStructure">+ Add Item</button>

          <h3 style="margin-top:1rem;">Project Assumptions</h3>
          <div class="form-row">
            <div class="form-group" style="flex:1">
              <label for="designStability">Design Stability</label>
              <select id="designStability">
                ${DESIGN_STABILITY_OPTIONS.map((o) => `<option value="${o.value}" ${state.assumptions.designStability === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="flex:1">
              <label for="gravitySystem">Gravity System</label>
              <select id="gravitySystem">
                ${GRAVITY_SYSTEM_OPTIONS.map((o) => `<option value="${o.value}" ${state.assumptions.gravitySystem === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="flex:1">
              <label for="lateralSystem">Lateral System</label>
              <select id="lateralSystem">
                ${LATERAL_SYSTEM_OPTIONS.map((o) => `<option value="${o.value}" ${state.assumptions.lateralSystem === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="flex:1">
              <label for="projectType">Project Type</label>
              <select id="projectType">
                ${PROJECT_TYPE_OPTIONS.map((o) => `<option value="${o.value}" ${state.assumptions.projectType === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="flex:1">
              <label for="foundationType">Foundation Type</label>
              <select id="foundationType">
                ${FOUNDATION_TYPE_OPTIONS.map((o) => `<option value="${o.value}" ${state.assumptions.foundationType === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="flex:1">
              <label for="geotechReport">Geotechnical Report</label>
              <select id="geotechReport">
                ${GEOTECH_REPORT_OPTIONS.map((o) => `<option value="${o.value}" ${state.assumptions.geotechReport === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="flex:1">
              <label for="trussPackage">Truss Package Expected</label>
              <select id="trussPackage">
                ${TRUSS_PACKAGE_OPTIONS.map((o) => `<option value="${o.value}" ${state.assumptions.trussPackage === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <!-- Section 1: Base Geometry -->
        <div class="form-section">
          <h3>1. Base Geometry</h3>
          <div class="form-row">
            <div class="form-group">
              <label for="stories">Number of Stories</label>
              <select id="stories">
                ${[1, 2, 3, 4].map((n) => `<option value="${n}" ${n === state.stories ? 'selected' : ''}>${n}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="squareFootage">Total Square Footage</label>
              <input type="number" id="squareFootage" min="0" step="100" value="${state.squareFootage}">
            </div>
            <div class="form-group">
              <label for="dollarPerHour">Target $/Hour</label>
              <input type="number" id="dollarPerHour" min="1" step="1" value="${state.dollarPerHour}">
            </div>
          </div>
          <p class="help-text">Look at the floor plan for each layer and trace around the outside edge. Count every corner where the perimeter changes direction — both inward (concave) and outward (convex) corners. Skip any small jogs under about 1 foot. If the building has a detached garage, separate wing, or any part with its own independent floor structure, click "+ Add Outline" and count corners for that section separately.</p>
          ${layers.map((key) => renderCornerLayer(key)).join('')}
          <div class="form-row" style="margin-top: 0.75rem;">
            <div class="form-group">
              <label for="roofCount">Number of separate roof areas</label>
              <input type="number" id="roofCount" min="0" value="${state.roofCount}">
            </div>
          </div>
          <p class="help-text">Look at the roof plan or elevations and count each separate roof area. Examples: a main high roof, a lower roof over a bump-out, a porch roof, and a garage roof would be 4 roof chunks.</p>
          <div class="form-row" style="margin-top: 0.75rem;">
            <div class="form-group">
              <label for="pierAndBeamPresent">Pier and Beam Present?</label>
              <select id="pierAndBeamPresent">
                <option value="no" ${!state.pierAndBeamPresent ? 'selected' : ''}>No</option>
                <option value="yes" ${state.pierAndBeamPresent ? 'selected' : ''}>Yes</option>
              </select>
            </div>
          </div>
          <div id="pierAndBeamSection" style="${state.pierAndBeamPresent ? '' : 'display:none'}">
            <p class="help-text">Trace the perimeter of the pier and beam floor area and count every corner where the edge changes direction, just like you did for the layers above.</p>
            ${renderPierAndBeamOutlines()}
          </div>
        </div>

        <!-- Section 2: Roof & Foundation Levels -->
        <div class="form-section">
          <h3>2. Roof & Foundation Levels</h3>
          <p class="help-text">Foundation levels: how many distinct foundation elevation levels are shown on the plans (e.g., a house with a basement slab and a main-floor slab = 2). Roof levels: how many distinct roof-framing elevations appear (e.g., a single gable = 1; a main roof plus a lower shed dormer at a different bearing height = 2).</p>
          <div class="form-row">
            <div class="form-group">
              <label for="foundationLevels">Foundation Levels</label>
              <input type="number" id="foundationLevels" min="0" value="${state.foundationLevels}">
            </div>
            <div class="form-group">
              <label for="roofLevels">Roof Levels</label>
              <input type="number" id="roofLevels" min="0" value="${state.roofLevels}">
            </div>
          </div>
        </div>

        <!-- 3) Concrete Details -->
        <div class="form-section">
          <h3>3. Concrete Details</h3>
          <p class="help-text"><strong>Minor</strong> (3 hrs each): all concrete structures ≤ 6 ft in height — shallow spread footers, small retaining walls 4–6 ft, staircases, equipment pads, etc. If pier &amp; beam is present above, the minor count automatically starts at 1 to account for the piers.
          <br><strong>Major</strong> (6 hrs each): any concrete structures &gt; 6 ft in height, or anything the estimator deems structurally complex — tall retaining walls, deep foundations, grade beams, etc.
          <br><strong>Manual</strong>: use "Add Detail" for anything that doesn't fit the categories above; enter a description and hours for each.</p>
          <div class="form-row">
            <div class="form-group">
              <label for="minorConcreteDetails">Minor Details</label>
              <input type="number" id="minorConcreteDetails" min="0" value="${Math.max(state.minorConcreteDetails, state.pierAndBeamPresent ? 1 : 0)}">
            </div>
            <div class="form-group">
              <label for="majorConcreteDetails">Major Details</label>
              <input type="number" id="majorConcreteDetails" min="0" value="${state.majorConcreteDetails}">
            </div>
          </div>
          <div id="manualConcreteSection">
            <div id="manualConcreteList">
              ${(state.manualConcreteDetails || []).map((item, idx) => `
                <div class="form-row manual-concrete-row" data-idx="${idx}">
                  <div class="form-group" style="flex:2">
                    <label>Description</label>
                    <input type="text" class="manual-concrete-desc" data-idx="${idx}" value="${item.desc || ''}">
                  </div>
                  <div class="form-group" style="flex:1">
                    <label>Hours</label>
                    <input type="number" class="manual-concrete-hrs" data-idx="${idx}" min="0" step="0.5" value="${item.hours || 0}">
                  </div>
                  <div class="form-group" style="flex:0; align-self:flex-end;">
                    <button class="btn-remove-manual-concrete" data-idx="${idx}" title="Remove">&times;</button>
                  </div>
                </div>
              `).join('')}
            </div>
            <button class="btn-small" id="btnAddManualConcrete">+ Add Detail</button>
          </div>
        </div>

        <hr class="section-divider">
        <h2>Modifiers</h2>

        <!-- 5) Discontinuities -->
        <div class="form-section">
          <h3>4. Discontinuities Between Adjacent Levels</h3>
          <p class="help-text">Compare the floor plans of adjacent stories. Each time a bearing wall or column on an upper level does not line up (within about 1 ft) with a wall or column on the level directly below it, that counts as one discontinuity. Only count multi-story buildings.</p>
          <div class="form-row">
            <div class="form-group">
              <label for="discontinuities">Number of Discontinuities</label>
              <input type="number" id="discontinuities" min="0" value="${state.discontinuities}">
            </div>
          </div>
        </div>

        <!-- 5) Long-span Counts -->
        <div class="form-section">
          <h3>5. Long-Span Counts</h3>
          <p class="help-text">Look at the dimension strings on the floor plans. Count each room or open area where the clear span between supports (walls or columns) falls in these ranges. Spans under 16 ft are considered normal and already covered by the framing square rate.</p>
          <div class="form-row">
            <div class="form-group">
              <label for="span16to24Count">Spans 16–24 ft</label>
              <input type="number" id="span16to24Count" min="0" value="${state.span16to24Count}">
            </div>
            <div class="form-group">
              <label for="spanOver24Count">Spans &gt;24 ft</label>
              <input type="number" id="spanOver24Count" min="0" value="${state.spanOver24Count}">
            </div>
          </div>
        </div>

        <!-- 7) Section-driven Complexity -->
        <div class="form-section">
          <h3>6. Section-Driven Complexity</h3>
          <p class="help-text">These items come from reviewing the building sections, elevations, and floor plans for conditions that add structural complexity.</p>
          <div class="form-row">
            <div class="form-group">
              <label for="vaultZones">Vaulted / Cathedral Zones</label>
              <input type="number" id="vaultZones" min="0" value="${state.vaultZones}">
            </div>
            <div class="form-group">
              <label for="plateHeightSets">Distinct Plate Heights</label>
              <input type="number" id="plateHeightSets" min="1" value="${state.plateHeightSets}">
            </div>
          </div>
          <p class="help-text"><strong>Vaulted zones:</strong> Count each area on the ceiling plan or sections where the ceiling follows the roof slope (no flat ceiling / attic above). <strong>Plate-height sets:</strong> Look at the wall sections — how many different top-of-wall (plate) heights are there? A typical single-story house with all 8 ft ceilings = 1. If some rooms are 8 ft and others are 10 ft, that's 2.</p>
          <div class="form-row">
            <div class="form-group">
              <label for="voidsPenetrations">Big Penetrations / Voids</label>
              <input type="number" id="voidsPenetrations" min="0" value="${state.voidsPenetrations}">
            </div>
            <div class="form-group">
              <label for="cantileverAreas">Cantilever Areas &gt;2 ft</label>
              <input type="number" id="cantileverAreas" min="0" value="${state.cantileverAreas}">
            </div>
          </div>
          <p class="help-text"><strong>Big penetrations / voids:</strong> Count large openings through floor or roof structure — stairwells, double-height spaces, large skylights, or chimney chases. Ignore standard MEP penetrations. <strong>Cantilever areas:</strong> Count each location where the floor or roof structure extends more than 2 ft past the supporting wall below (bay windows, balconies, bump-outs).</p>
        </div>

        <!-- 8) Lateral Complexity -->
        <div class="form-section">
          <h3>7. Lateral Analysis</h3>
          <div class="form-row">
            <div class="form-group">
              <label for="lateralRequired">Lateral Required?</label>
              <select id="lateralRequired">
                <option value="yes" ${state.lateralRequired ? 'selected' : ''}>Yes</option>
                <option value="no" ${!state.lateralRequired ? 'selected' : ''}>No</option>
              </select>
            </div>
          </div>
          <div id="lateralSection" style="${state.lateralRequired ? '' : 'display:none'}">
            <p class="help-text">For each level, look at the floor plan and identify wall lines that are supposed to resist lateral (wind/seismic) forces but are heavily interrupted by large openings, garage doors, or windows — making it difficult to fit a standard braced or shear wall segment. Count the number of such problematic lines per level.</p>
            <div class="form-row">
              ${layers.filter((k) => k !== 'slab').map((key) => {
                const num = key.replace('level', '');
                const val = state.problematicBraceLines[key] || 0;
                return `<div class="form-group">
                  <label for="brace_${key}">Level ${num}</label>
                  <input type="number" id="brace_${key}" min="0" value="${val}">
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- 8) Specialty Details -->
        <div class="form-section">
          <h3>8. Specialty Details</h3>
          <p class="help-text">Use this section for any additional scope items that require manual hour entry — swimming pools, ornamental staircases, unusually large cantilevers, high-risk conditions, or anything else not captured above. Click "Add Detail" and enter a description and estimated hours for each.</p>
          <div id="specialtyDetailsList">
            ${(state.specialtyDetails || []).map((item, idx) => `
              <div class="form-row specialty-detail-row" data-idx="${idx}">
                <div class="form-group" style="flex:2">
                  <label>Description</label>
                  <input type="text" class="specialty-desc" data-idx="${idx}" value="${item.desc || ''}">
                </div>
                <div class="form-group" style="flex:1">
                  <label>Hours</label>
                  <input type="number" class="specialty-hrs" data-idx="${idx}" min="0" step="0.5" value="${item.hours || 0}">
                </div>
                <div class="form-group" style="flex:0; align-self:flex-end;">
                  <button class="btn-remove-specialty" data-idx="${idx}" title="Remove">&times;</button>
                </div>
              </div>
            `).join('')}
          </div>
          <button class="btn-small" id="btnAddSpecialty">+ Add Detail</button>
        </div>

        <div class="form-actions">
          <button class="btn btn-primary" id="btnCalculate">Calculate Estimate</button>
          <button class="btn btn-secondary" id="btnReset">Reset</button>
        </div>
      </div>

      <div id="estimate-output"></div>
    `;

    bindFormEvents();
  }

  function renderCornerLayer(key) {
    const outlines = state.cornerOutlines[key] || [4];
    const label = getLayerLabel(key);

    return `
      <div class="corner-layer" data-layer="${key}">
        <div class="corner-layer-header">
          <span class="corner-layer-label">${label}</span>
          <button class="btn-small btn-add-outline" data-layer="${key}">+ Add Outline</button>
        </div>
        <div class="corner-outlines">
          ${outlines.map((count, idx) => `
            <div class="outline-row">
              <label>Outline ${idx + 1} corners</label>
              <input type="number" class="corner-input" data-layer="${key}" data-idx="${idx}" min="0" step="1" value="${count}">
              ${outlines.length > 1 ? `<button class="btn-remove-outline" data-layer="${key}" data-idx="${idx}" title="Remove outline">&times;</button>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderPierAndBeamOutlines() {
    const outlines = state.pierAndBeamCorners;
    return `
      <div class="corner-layer" data-layer="pierAndBeam">
        <div class="corner-layer-header">
          <span class="corner-layer-label">Pier &amp; Beam Floor Framing</span>
          <button class="btn-small btn-add-pb-outline">+ Add Outline</button>
        </div>
        <div class="corner-outlines">
          ${outlines.map((count, idx) => `
            <div class="outline-row">
              <label>Outline ${idx + 1} corners</label>
              <input type="number" class="pb-corner-input" data-idx="${idx}" min="0" step="1" value="${count}">
              ${outlines.length > 1 ? `<button class="btn-remove-pb-outline" data-idx="${idx}" title="Remove outline">&times;</button>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function bindFormEvents() {
    const btnAddStructure = document.getElementById('btnAddStructure');
    if (btnAddStructure) {
      btnAddStructure.addEventListener('click', () => {
        readFormIntoState();
        state.structuresScope.push({ id: nextStructureScopeId(), text: '' });
        rebuildForm();
      });
    }

    document.querySelectorAll('.btn-remove-structure').forEach((btn) => {
      btn.addEventListener('click', () => {
        readFormIntoState();
        const idx = parseInt(btn.dataset.idx);
        state.structuresScope.splice(idx, 1);
        rebuildForm();
      });
    });

    document.getElementById('stories').addEventListener('change', (e) => {
      readFormIntoState();
      state.stories = parseInt(e.target.value);
      initCornerOutlines();
      rebuildForm();
    });

    document.querySelectorAll('.btn-add-outline').forEach((btn) => {
      btn.addEventListener('click', () => {
        readFormIntoState();
        const layer = btn.dataset.layer;
        state.cornerOutlines[layer].push(4);
        rebuildForm();
      });
    });

    document.querySelectorAll('.btn-remove-outline').forEach((btn) => {
      btn.addEventListener('click', () => {
        readFormIntoState();
        const layer = btn.dataset.layer;
        const idx = parseInt(btn.dataset.idx);
        state.cornerOutlines[layer].splice(idx, 1);
        rebuildForm();
      });
    });

    document.getElementById('lateralRequired').addEventListener('change', (e) => {
      const show = e.target.value === 'yes';
      document.getElementById('lateralSection').style.display = show ? '' : 'none';
    });

    document.getElementById('pierAndBeamPresent').addEventListener('change', (e) => {
      const show = e.target.value === 'yes';
      document.getElementById('pierAndBeamSection').style.display = show ? '' : 'none';
      if (show) {
        const minorInput = document.getElementById('minorConcreteDetails');
        if (parseInt(minorInput.value) < 1) {
          minorInput.value = 1;
        }
      }
    });

    document.querySelectorAll('.btn-add-pb-outline').forEach((btn) => {
      btn.addEventListener('click', () => {
        readFormIntoState();
        state.pierAndBeamCorners.push(4);
        rebuildForm();
      });
    });

    document.querySelectorAll('.btn-remove-pb-outline').forEach((btn) => {
      btn.addEventListener('click', () => {
        readFormIntoState();
        const idx = parseInt(btn.dataset.idx);
        state.pierAndBeamCorners.splice(idx, 1);
        rebuildForm();
      });
    });

    document.getElementById('btnAddManualConcrete').addEventListener('click', () => {
      readFormIntoState();
      state.manualConcreteDetails.push({ desc: '', hours: 0 });
      rebuildForm();
    });

    document.querySelectorAll('.btn-remove-manual-concrete').forEach((btn) => {
      btn.addEventListener('click', () => {
        readFormIntoState();
        const idx = parseInt(btn.dataset.idx);
        state.manualConcreteDetails.splice(idx, 1);
        rebuildForm();
      });
    });

    document.getElementById('btnAddSpecialty').addEventListener('click', () => {
      readFormIntoState();
      state.specialtyDetails.push({ desc: '', hours: 0 });
      rebuildForm();
    });

    document.querySelectorAll('.btn-remove-specialty').forEach((btn) => {
      btn.addEventListener('click', () => {
        readFormIntoState();
        const idx = parseInt(btn.dataset.idx);
        state.specialtyDetails.splice(idx, 1);
        rebuildForm();
      });
    });

    document.getElementById('btnCalculate').addEventListener('click', () => {
      readFormIntoState();
      calculateAndRender();
    });

    document.getElementById('btnReset').addEventListener('click', () => {
      resetState();
      rebuildForm();
    });

    document.getElementById('btnImport').addEventListener('click', () => {
      importProject();
    });
  }

  // ---------- Export / Import (per-tool, v3 envelope) ----------

  async function exportProject() {
    const name = state.projectAddress || state.clientName || 'Untitled Project';
    const safeName = name.replace(/[^a-zA-Z0-9 _\-]/g, '');
    const wrapper = {
      version: 3,
      tool: 'se',
      name,
      date: new Date().toISOString(),
      state,
    };
    const json = JSON.stringify(wrapper, null, 2);
    const blob = new Blob([json], { type: 'application/json' });

    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: safeName + ' - SE Estimate.json',
          types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName + ' - SE Estimate.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importProject() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const wrapper = JSON.parse(reader.result);
          let imported;
          if (wrapper && wrapper.version === 3) {
            if (wrapper.tool && wrapper.tool !== 'se') {
              alert('This is an A/E estimate file. Open it on the A/E page.');
              return;
            }
            imported = wrapper.state;
          } else if (wrapper && wrapper.version === 2) {
            imported = wrapper.seState;
            if (!imported) { alert('No SE estimate found in this file.'); return; }
          } else {
            imported = (wrapper && wrapper.state) || wrapper;
          }
          if (!imported || typeof imported.stories !== 'number') {
            alert('This file does not appear to be a valid SE estimate.');
            return;
          }
          state = migrateImportedState(imported);
          initCornerOutlines();
          rebuildForm();
        } catch (e) {
          alert('Could not read file: ' + e.message);
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  function readFormIntoState() {
    const addrEl = document.getElementById('projectAddress');
    const clientEl = document.getElementById('clientName');
    if (addrEl) state.projectAddress = addrEl.value || '';
    if (clientEl) state.clientName = clientEl.value || '';

    if (!Array.isArray(state.structuresScope)) state.structuresScope = [];
    document.querySelectorAll('.structures-scope-input').forEach((input) => {
      const idx = parseInt(input.dataset.idx);
      if (state.structuresScope[idx]) {
        state.structuresScope[idx].text = input.value || '';
      }
    });

    if (!state.assumptions) state.assumptions = {};
    const designStabilityEl = document.getElementById('designStability');
    const gravitySystemEl   = document.getElementById('gravitySystem');
    const lateralSystemEl   = document.getElementById('lateralSystem');
    const projectTypeEl     = document.getElementById('projectType');
    const trussPackageEl    = document.getElementById('trussPackage');
    const foundationTypeEl  = document.getElementById('foundationType');
    const geotechReportEl   = document.getElementById('geotechReport');
    if (designStabilityEl) state.assumptions.designStability = designStabilityEl.value;
    if (gravitySystemEl)   state.assumptions.gravitySystem   = gravitySystemEl.value;
    if (lateralSystemEl)   state.assumptions.lateralSystem   = lateralSystemEl.value;
    if (projectTypeEl)     state.assumptions.projectType     = projectTypeEl.value;
    if (trussPackageEl)    state.assumptions.trussPackage    = trussPackageEl.value;
    if (foundationTypeEl)  state.assumptions.foundationType  = foundationTypeEl.value;
    if (geotechReportEl)   state.assumptions.geotechReport   = geotechReportEl.value;

    state.stories = parseInt(document.getElementById('stories').value) || 1;

    document.querySelectorAll('.corner-input').forEach((input) => {
      const layer = input.dataset.layer;
      const idx = parseInt(input.dataset.idx);
      if (!state.cornerOutlines[layer]) state.cornerOutlines[layer] = [];
      const val = parseInt(input.value);
      state.cornerOutlines[layer][idx] = isNaN(val) ? 4 : val;
    });

    const validKeys = new Set(getLayerKeys());
    Object.keys(state.cornerOutlines).forEach((k) => {
      if (!validKeys.has(k)) delete state.cornerOutlines[k];
    });

    state.squareFootage = parseFloat(document.getElementById('squareFootage').value) || 0;
    state.roofCount = intOrZero(document.getElementById('roofCount').value);
    state.foundationLevels = intOrZero(document.getElementById('foundationLevels').value);
    state.roofLevels = intOrZero(document.getElementById('roofLevels').value);
    state.minorConcreteDetails = parseInt(document.getElementById('minorConcreteDetails').value) || 0;
    if (state.pierAndBeamPresent && state.minorConcreteDetails < 1) state.minorConcreteDetails = 1;
    state.majorConcreteDetails = parseInt(document.getElementById('majorConcreteDetails').value) || 0;
    state.manualConcreteDetails = [];
    document.querySelectorAll('.manual-concrete-row').forEach((row) => {
      const desc = row.querySelector('.manual-concrete-desc').value || '';
      const hours = parseFloat(row.querySelector('.manual-concrete-hrs').value) || 0;
      state.manualConcreteDetails.push({ desc, hours });
    });
    state.dollarPerHour = parseFloat(document.getElementById('dollarPerHour').value) || 160;

    state.discontinuities = parseInt(document.getElementById('discontinuities').value) || 0;
    state.span16to24Count = parseInt(document.getElementById('span16to24Count').value) || 0;
    state.spanOver24Count = parseInt(document.getElementById('spanOver24Count').value) || 0;

    state.vaultZones = parseInt(document.getElementById('vaultZones').value) || 0;
    state.plateHeightSets = parseInt(document.getElementById('plateHeightSets').value) || 1;
    state.voidsPenetrations = parseInt(document.getElementById('voidsPenetrations').value) || 0;
    state.cantileverAreas = parseInt(document.getElementById('cantileverAreas').value) || 0;

    state.lateralRequired = document.getElementById('lateralRequired').value === 'yes';

    const layers = getLayerKeys().filter((k) => k !== 'slab');
    layers.forEach((key) => {
      const el = document.getElementById('brace_' + key);
      state.problematicBraceLines[key] = el ? parseInt(el.value) || 0 : 0;
    });
    for (let i = state.stories + 1; i <= 4; i++) {
      state.problematicBraceLines['level' + i] = 0;
    }

    state.specialtyDetails = [];
    document.querySelectorAll('.specialty-detail-row').forEach((row) => {
      const desc = row.querySelector('.specialty-desc').value || '';
      const hours = parseFloat(row.querySelector('.specialty-hrs').value) || 0;
      state.specialtyDetails.push({ desc, hours });
    });

    state.pierAndBeamPresent = document.getElementById('pierAndBeamPresent').value === 'yes';
    state.pierAndBeamCorners = [];
    document.querySelectorAll('.pb-corner-input').forEach((input) => {
      const val = parseInt(input.value);
      state.pierAndBeamCorners.push(isNaN(val) ? 4 : val);
    });
    if (state.pierAndBeamCorners.length === 0) state.pierAndBeamCorners = [4];
  }

  function calculateAndRender() {
    const work = [];

    const layerKeys = getLayerKeys();
    const layerSquares = {};
    let totalSquares = 0;

    work.push({ heading: 'Step 1: Convert Corners to Squares' });
    work.push({ note: 'Each plan-view outline is converted from a corner count to a "square" count using Squares = (Corners ÷ 2) − 1. A square is roughly one rectangular bay of structure. Squares per layer drive most of the base hours in Step 2.' });

    layerKeys.forEach((key) => {
      const outlines = state.cornerOutlines[key] || [4];
      let layerTotal = 0;
      const parts = [];

      outlines.forEach((corners, idx) => {
        const sq = Math.max((corners / 2) - 1, 0);
        layerTotal += sq;
        parts.push(`Outline ${idx + 1}: (${corners} ÷ 2) − 1 = ${formatNum(sq)} sq`);
      });

      layerSquares[key] = layerTotal;
      totalSquares += layerTotal;

      const label = getLayerLabel(key);
      if (outlines.length === 1) {
        work.push({ label: label, detail: parts[0], value: formatNum(layerTotal) + ' sq' });
      } else {
        work.push({ label: label, detail: parts.join('  |  ') + `  →  sum = ${formatNum(layerTotal)}`, value: formatNum(layerTotal) + ' sq' });
      }
    });

    let pierAndBeamSquares = 0;
    if (state.pierAndBeamPresent) {
      const pbOutlines = state.pierAndBeamCorners;
      const pbParts = [];
      pbOutlines.forEach((corners, idx) => {
        const sq = Math.max((corners / 2) - 1, 0);
        pierAndBeamSquares += sq;
        pbParts.push(`Outline ${idx + 1}: (${corners} ÷ 2) − 1 = ${formatNum(sq)} sq`);
      });
      if (pbOutlines.length === 1) {
        work.push({ label: 'Pier & Beam Floor Framing', detail: pbParts[0], value: formatNum(pierAndBeamSquares) + ' sq' });
      } else {
        work.push({ label: 'Pier & Beam Floor Framing', detail: pbParts.join('  |  ') + `  →  sum = ${formatNum(pierAndBeamSquares)}`, value: formatNum(pierAndBeamSquares) + ' sq' });
      }
      totalSquares += pierAndBeamSquares;
    }

    const foundationSquares = layerSquares['slab'] || 0;
    const framingKeys = layerKeys.filter((k) => k !== 'slab');
    const framingSquares = framingKeys.reduce((sum, k) => sum + (layerSquares[k] || 0), 0);

    work.push({ label: 'Foundation Squares (slab layer)', detail: '', value: formatNum(foundationSquares) + ' squares', bold: false });
    work.push({ label: 'Framing Squares (all ceiling/floor layers)', detail: framingKeys.length > 0 ? framingKeys.map((k) => formatNum(layerSquares[k])).join(' + ') + ' (per-layer totals)' : '', value: formatNum(framingSquares) + ' squares', bold: false });
    if (state.pierAndBeamPresent) {
      work.push({ label: 'Pier & Beam Squares', detail: '', value: formatNum(pierAndBeamSquares) + ' squares', bold: false });
    }
    work.push({ label: 'Roof Count', detail: 'Number of separate roof areas', value: state.roofCount, bold: false });
    work.push({ label: 'Total Squares', detail: 'Foundation + Framing' + (state.pierAndBeamPresent ? ' + Pier & Beam' : '') + ' = ' + formatNum(foundationSquares) + ' + ' + formatNum(framingSquares) + (state.pierAndBeamPresent ? ' + ' + formatNum(pierAndBeamSquares) : ''), value: formatNum(totalSquares) + ' squares', bold: true });

    work.push({ heading: 'Step 2: Base Hours' });
    work.push({ note: 'Engineering hours for the structural elements before any complexity factors, modifiers, setup, or coordination are applied.' });

    // Foundation squares use a tapered rate: the first sq is 1.0 hr, each
    // additional sq drops by 0.1 hr, and every sq past #8 is floored at
    // 0.25 hr. Closed form of that per-square sum:
    //   n ≤ 8: 1.05n − 0.05n²      (quadratic decay)
    //   n > 8: 5.2 + 0.25(n − 8)   (linear at the floor)
    const fndLevelHours = state.foundationLevels * 1;
    const fndSquareHours = foundationSquares <= 0
      ? 0
      : (foundationSquares <= 8
          ? 1.05 * foundationSquares - 0.05 * foundationSquares * foundationSquares
          : 5.2 + 0.25 * (foundationSquares - 8));
    const foundationHours = fndLevelHours + fndSquareHours;

    // Framing squares use a tapered rate: the first sq is 3.0 hr, each
    // additional sq drops by 0.167 hr, and every sq from #10 onward is
    // floored at 1.5 hr. Reflects shared-wall overlap as squares connect —
    // headers, studs, and some drafting on a shared wall are sized once,
    // not twice. Closed form of that per-square sum:
    //   n ≤ 9: 3n − 0.0835·n·(n−1)        (linear-decay sum)
    //   n > 9: 20.988 + 1.5·(n − 9)       (linear at the floor)
    const framingSquareHours = framingSquares <= 0
      ? 0
      : (framingSquares <= 9
          ? 3 * framingSquares - 0.0835 * framingSquares * (framingSquares - 1)
          : 20.988 + 1.5 * (framingSquares - 9));

    const roofLevelHours = state.roofLevels * 1;
    const roofCountHours = state.roofCount * 1;
    const roofHours = roofLevelHours + roofCountHours;

    const minorConcreteHours = 3 * state.minorConcreteDetails;
    const majorConcreteHours = 6 * state.majorConcreteDetails;
    const manualConcreteHours = (state.manualConcreteDetails || []).reduce((sum, item) => sum + (item.hours || 0), 0);
    const concreteHours = minorConcreteHours + majorConcreteHours + manualConcreteHours;

    work.push({ label: 'Foundation', detail: `${state.foundationLevels} foundation level${state.foundationLevels === 1 ? '' : 's'} × 1 hr (one sheet setup per level) + ${formatNum(foundationSquares)} squares of foundation, tapered (first square = 1.0 hr, dropping 0.1 hr each, floored at 0.25 hr/sq) = ${formatNum(fndSquareHours)} hr from squares`, value: formatNum(foundationHours) + ' hrs' });
    work.push({ label: 'Framing', detail: `${formatNum(framingSquares)} framing squares, tapered (first sq = 3.0 hr — joist sizing + 4 sides of header sizing + 4 sides of stud sizing + drafting; each additional sq drops 0.167 hr because shared walls between adjacent squares mean headers/studs/drafting on the shared wall are sized once, not twice; floored at 1.5 hr/sq from sq #10 onward)`, value: formatNum(framingSquareHours) + ' hrs' });

    const pierAndBeamHours = state.pierAndBeamPresent ? 2 * pierAndBeamSquares : 0;
    if (state.pierAndBeamPresent) {
      work.push({ label: 'Pier & beam framing', detail: `${formatNum(pierAndBeamSquares)} pier-and-beam squares × 2 hr each (uniform pier grid + repetitive beams; less variable than typical framing)`, value: formatNum(pierAndBeamHours) + ' hrs' });
    }
    work.push({ label: 'Roof', detail: `${state.roofLevels} roof level${state.roofLevels === 1 ? '' : 's'} × 1 hr (each new bearing height needs its own framing plan) + ${state.roofCount} separate roof area${state.roofCount === 1 ? '' : 's'} × 1 hr (each chunk: rafter sizing, ridge, line work)`, value: formatNum(roofHours) + ' hrs' });
    const concreteParts = [];
    if (state.minorConcreteDetails > 0) concreteParts.push(`${state.minorConcreteDetails} minor (≤6 ft) × 3 hr = ${formatNum(minorConcreteHours)} hr`);
    if (state.majorConcreteDetails > 0) concreteParts.push(`${state.majorConcreteDetails} major (>6 ft or complex) × 6 hr = ${formatNum(majorConcreteHours)} hr`);
    if (manualConcreteHours > 0) concreteParts.push(`manually-entered details: ${formatNum(manualConcreteHours)} hr`);
    work.push({ label: 'Concrete details', detail: concreteParts.length ? concreteParts.join(' + ') : 'none entered', value: formatNum(concreteHours) + ' hrs' });

    const baseHours = foundationHours + framingSquareHours + pierAndBeamHours + roofHours + concreteHours;
    const baseParts = [foundationHours, framingSquareHours, pierAndBeamHours, roofHours, concreteHours].map(formatNum).join(' + ');
    work.push({ label: 'Base Hours Total', detail: 'Foundation + Framing + Pier & Beam + Roof + Concrete = ' + baseParts, value: formatNum(baseHours) + ' hrs', bold: true });

    let lateralHours = 0;
    if (state.lateralRequired) {
      work.push({ heading: 'Step 3: Lateral Hours' });
      work.push({ note: 'Wind/seismic resistance work — diaphragm shear, hold-down design, and any walls flagged as "problematic brace lines" because openings interrupt them. Upper-story lines weight slightly higher because their loads have to transfer down through the diaphragm.' });

      const lateralBaseHours = 3 * state.stories;
      work.push({ label: 'Lateral base', detail: `${state.stories} story${state.stories === 1 ? '' : ' (each story)'} × 3 hr (typical shear-wall analysis and hold-down schedule per level)`, value: formatNum(lateralBaseHours) + ' hrs' });

      const L1 = state.problematicBraceLines.level1 || 0;
      const L2 = state.problematicBraceLines.level2 || 0;
      const L3 = state.problematicBraceLines.level3 || 0;
      const L4 = state.problematicBraceLines.level4 || 0;

      const weightedParts = [];
      const weightedValues = [];
      if (state.stories >= 1) { weightedParts.push(`Level 1: ${L1} problematic line${L1 === 1 ? '' : 's'} × 1.0 weight (ground floor baseline)`);                       weightedValues.push(L1 * 1.0); }
      if (state.stories >= 2) { weightedParts.push(`Level 2: ${L2} problematic line${L2 === 1 ? '' : 's'} × 1.2 weight (upper-story load path adds complexity)`);       weightedValues.push(L2 * 1.2); }
      if (state.stories >= 3) { weightedParts.push(`Level 3: ${L3} problematic line${L3 === 1 ? '' : 's'} × 1.3 weight`);                                                weightedValues.push(L3 * 1.3); }
      if (state.stories >= 4) { weightedParts.push(`Level 4: ${L4} problematic line${L4 === 1 ? '' : 's'} × 1.4 weight`);                                                weightedValues.push(L4 * 1.4); }

      const weightedSum = weightedValues.reduce((a, b) => a + b, 0);
      lateralHours = lateralBaseHours + 3 * weightedSum;

      weightedParts.forEach((p) => work.push({ label: '', detail: p, value: '' }));
      work.push({ label: 'Weighted sum of problematic lines', detail: 'Sum of (count × weight) across all stories', value: formatNum(weightedSum) });
      work.push({ label: 'Lateral Hours', detail: `${formatNum(lateralBaseHours)} hr base + 3 hr per weighted line × ${formatNum(weightedSum)} weighted lines = ${formatNum(lateralHours)} hr`, value: formatNum(lateralHours) + ' hrs', bold: true });
    } else {
      work.push({ heading: 'Step 3: Lateral Hours (Not Required)' });
      work.push({ label: 'Lateral Hours', detail: 'Lateral Required toggle is off — no wind/seismic work in scope', value: '0 hrs', bold: true });
    }

    work.push({ heading: 'Step 4: Modifier Hours' });
    work.push({ note: 'Per-event hours for conditions that add structural complexity beyond the typical bay (long spans, transfer beams, cantilevers, etc.). Lateral hours from Step 3 are folded in here so the total reflects all complexity-driven work.' });

    const discHours = 3 * state.discontinuities;
    const span16Hours = 2 * state.span16to24Count;
    const spanOver24Hours = 6 * state.spanOver24Count;
    const vaultHours = 3 * state.vaultZones;
    const plateExtra = Math.max(state.plateHeightSets - 1, 0);
    const plateHours = 1 * plateExtra;
    const voidHours = 2 * state.voidsPenetrations;
    const cantileverHours = 3 * state.cantileverAreas;
    const specialtyHours = (state.specialtyDetails || []).reduce((sum, item) => sum + (item.hours || 0), 0);

    work.push({ label: 'Discontinuities', detail: `${state.discontinuities} discontinuit${state.discontinuities === 1 ? 'y' : 'ies'} × 3 hr each (analyze the transferred point load + size a beam to carry it down)`, value: formatNum(discHours) + ' hrs' });
    work.push({ label: 'Spans 16–24 ft', detail: `${state.span16to24Count} span${state.span16to24Count === 1 ? '' : 's'} × 2 hr each (TJI/LVL span-table lookup + plan note)`, value: formatNum(span16Hours) + ' hrs' });
    work.push({ label: 'Spans >24 ft', detail: `${state.spanOver24Count} span${state.spanOver24Count === 1 ? '' : 's'} × 6 hr each (sized beam + supporting columns at each end + connection details)`, value: formatNum(spanOver24Hours) + ' hrs' });
    work.push({ label: 'Vaulted / cathedral zones', detail: `${state.vaultZones} zone${state.vaultZones === 1 ? '' : 's'} × 3 hr each (ridge beam sizing + ridge posts + section drawing)`, value: formatNum(vaultHours) + ' hrs' });
    work.push({ label: 'Plate-height transitions', detail: `${plateExtra} transition${plateExtra === 1 ? '' : 's'} between plate heights (${state.plateHeightSets} distinct heights minus the first one, which is free) × 1 hr each`, value: formatNum(plateHours) + ' hrs' });
    work.push({ label: 'Voids / penetrations', detail: `${state.voidsPenetrations} void${state.voidsPenetrations === 1 ? '' : 's'} × 2 hr each (header at the void edge + trimmer joists + plan note)`, value: formatNum(voidHours) + ' hrs' });
    work.push({ label: 'Cantilever areas', detail: `${state.cantileverAreas} cantilever${state.cantileverAreas === 1 ? '' : 's'} × 3 hr each (cantilever moment + back-span check + tail hold-down + detail)`, value: formatNum(cantileverHours) + ' hrs' });
    work.push({ label: 'Specialty (manual entries)', detail: specialtyHours > 0 ? `Sum of hours from manually-entered items in the Specialty Details section above` : 'none entered', value: formatNum(specialtyHours) + ' hrs' });
    work.push({ label: 'Lateral hours carried from Step 3', detail: 'Folded in here so the modifier total covers all complexity-driven work in one place', value: formatNum(lateralHours) + ' hrs' });

    const modifierHours = discHours + span16Hours + spanOver24Hours + vaultHours + plateHours + voidHours + cantileverHours + specialtyHours + lateralHours;
    const modParts = [discHours, span16Hours, spanOver24Hours, vaultHours, plateHours, voidHours, cantileverHours, specialtyHours, lateralHours].map(formatNum).join(' + ');
    work.push({ label: 'Modifier Hours Total', detail: 'Sum of all rows above: ' + modParts, value: formatNum(modifierHours) + ' hrs', bold: true });

    // ----- Step 5: System Complexity Factors -----
    // Gravity factor scales framing + P&B + roof + non-lateral modifiers.
    // Lateral factor scales lateral hours only. Foundation and concrete
    // details are left at their raw per-event values (foundation because
    // it scales with its own inputs regardless of superstructure; concrete
    // because unusual thrust-tie / deep-pier complexity is captured via
    // extra major-concrete-detail counts rather than the system factor).
    work.push({ heading: 'Step 5: System Complexity Factors' });
    work.push({ note: 'The Gravity System dropdown scales the framing/roof/modifier work (since concrete framing is harder than wood framing, etc.). The Lateral System dropdown scales only the lateral hours. Foundation and concrete details are left alone — they have their own per-event inputs.' });

    const a = state.assumptions || {};
    const gravFactor = gravityFactorFor(a.gravitySystem);
    const latFactor  = lateralFactorFor(a.lateralSystem);

    const nonLateralModifiers = discHours + span16Hours + spanOver24Hours
      + vaultHours + plateHours + voidHours + cantileverHours + specialtyHours;

    const gravityScope = framingSquareHours + pierAndBeamHours + roofHours + nonLateralModifiers;
    const adjustedGravity = gravityScope * gravFactor;
    const adjustedLateral = lateralHours * latFactor;

    const gravityLabel = labelFor(GRAVITY_SYSTEM_OPTIONS, a.gravitySystem);
    const lateralLabel = labelFor(LATERAL_SYSTEM_OPTIONS, a.lateralSystem);

    work.push({ label: 'Gravity system selected', detail: gravityLabel + ' — multiplier applied to gravity-scope hours', value: '×' + gravFactor.toFixed(2) });
    work.push({ label: 'Gravity scope (pre-factor)', detail: `Framing ${formatNum(framingSquareHours)} + Pier & Beam ${formatNum(pierAndBeamHours)} + Roof ${formatNum(roofHours)} + Non-lateral modifiers ${formatNum(nonLateralModifiers)} = ${formatNum(gravityScope)} hr`, value: formatNum(gravityScope) + ' hrs' });
    work.push({ label: 'Gravity scope (after factor)', detail: `${formatNum(gravityScope)} hr × ${gravFactor.toFixed(2)} (${gravityLabel} factor) = ${formatNum(adjustedGravity)} hr`, value: formatNum(adjustedGravity) + ' hrs', bold: true });
    work.push({ label: 'Lateral system selected', detail: lateralLabel + ' — multiplier applied to lateral hours only', value: '×' + latFactor.toFixed(2) });
    work.push({ label: 'Lateral hours (after factor)', detail: `${formatNum(lateralHours)} hr lateral × ${latFactor.toFixed(2)} (${lateralLabel} factor) = ${formatNum(adjustedLateral)} hr`, value: formatNum(adjustedLateral) + ' hrs', bold: true });

    // ----- Step 6: Raw Work -----
    work.push({ heading: 'Step 6: Raw Work' });
    work.push({ note: '"Raw work" = the engineering effort itself, before any drafting setup, ongoing coordination, or admin overhead. This is the number that drives most downstream auto-population (CA, feasibility, etc.).' });

    const rawWorkHours = foundationHours + concreteHours + adjustedGravity + adjustedLateral;
    work.push({ label: 'Raw Work', detail: `Foundation ${formatNum(foundationHours)} + Concrete ${formatNum(concreteHours)} + Gravity scope (factored) ${formatNum(adjustedGravity)} + Lateral (factored) ${formatNum(adjustedLateral)} = ${formatNum(rawWorkHours)} hr`, value: formatNum(rawWorkHours) + ' hrs', bold: true });

    work.push({ heading: 'Step 7: Setup & Standard Coordination' });
    work.push({ note: 'Setup = unavoidable drafting overhead per deliverable (cover sheet, general notes, Revit modeling/tracing, sheet setup). Standard Coordination = the small as-you-go decisions during CDs ("the header should be 12 inches not 10"). Both are required on every project.' });

    // Setup scales with the modeling-related portion of raw work only
    // (foundation + framing + P&B + roof). Concrete details and modifiers
    // are calc/detail work that don't drive Revit modeling effort.
    const geometricRaw = foundationHours + framingSquareHours + pierAndBeamHours + roofHours;
    const levelsTotal = state.foundationLevels + state.stories + state.roofLevels;
    const setupFixed = 1.5;
    const setupPerLevel = 0.5 * levelsTotal;
    const setupGeoPct = 0.10 * geometricRaw;
    const setupHours = setupFixed + setupPerLevel + setupGeoPct;
    work.push({ label: 'Setup', detail: `${formatNum(setupFixed)} hr fixed (cover sheet, general notes, code references, sealing) + ${formatNum(setupPerLevel)} hr per-sheet setup (0.5 hr × ${levelsTotal} framing-plan sheets: ${state.foundationLevels} foundation + ${state.stories} story + ${state.roofLevels} roof) + ${formatNum(setupGeoPct)} hr Revit modeling (10% of ${formatNum(geometricRaw)} hr "geometric raw" — foundation + framing + P&B + roof, the parts that get traced)`, value: formatNum(setupHours) + ' hrs' });

    // Coordination multiplier is no longer applied to raw work directly.
    // Instead it scales the standard coordination percentage so that bigger
    // physical footprints get more "as-you-go" coordination time.
    const coordinationMultiplier = state.squareFootage * 0.00001 + 1;
    const coordinationPct = 0.10 * coordinationMultiplier;
    const coordinationHours = coordinationPct * rawWorkHours;
    work.push({ label: 'Coordination multiplier', detail: `Scales coordination % up for physically larger projects: 1 + (${formatNum(state.squareFootage)} sf × 0.00001) = ${formatNum(coordinationMultiplier)} (a 10,000 sf project is ×1.10, a 1,000 sf project ×1.01)`, value: '×' + formatNum(coordinationMultiplier) });
    work.push({ label: 'Standard coordination', detail: `${(coordinationPct * 100).toFixed(2)}% of raw work (10% base × ${formatNum(coordinationMultiplier)} size multiplier) × ${formatNum(rawWorkHours)} hr raw = ${formatNum(coordinationHours)} hr`, value: formatNum(coordinationHours) + ' hrs' });

    work.push({ heading: 'Step 8: Structural Analysis and Design' });
    work.push({ note: 'The sealed deliverable line item — the engineer-of-record core scope. This combines raw work, drafting setup, and standard coordination into one number that becomes the "Structural Analysis and Design" line on the proposal.' });
    const totalHours = rawWorkHours + setupHours + coordinationHours;
    work.push({ label: 'Analysis & Design Hours', detail: `${formatNum(rawWorkHours)} hr raw work + ${formatNum(setupHours)} hr setup + ${formatNum(coordinationHours)} hr standard coordination = ${formatNum(totalHours)} hr`, value: formatNum(totalHours) + ' hrs', bold: true });

    const rate = state.dollarPerHour;
    const fee = totalHours * rate;
    work.push({ heading: 'Fee Estimate' });
    work.push({ label: 'Rate', detail: '', value: '$' + formatNum(rate) + ' /hr' });
    work.push({ label: 'Fee', detail: `${formatNum(totalHours)} hrs × $${formatNum(rate)}`, value: '$' + formatMoney(fee), bold: true });

    // ----- Step 9: Pre-Design + Design Coordination (auto-populate) -----
    // Site Visit, Preliminary Review & Feasibility, Early Design Assist,
    // and Design Coordination are all populated based on project inputs.
    // Included flags use Design Stability and Project Type to pick the
    // right defaults; the user can override any checkbox after Calculate.
    work.push({ heading: 'Step 9: Pre-Design + Design Coordination' });
    work.push({ note: 'Auto-populates the four design-side line items beyond the sealed set itself: Site Visit, Preliminary Review, Design Coordination (meetings during design to resolve conditions), and Early Design Assist (early-phase collaboration when geometry is still in flux). Each line\'s "Included" checkbox is set based on Project Type and Design Stability — you can override after Calculate.' });

    // Site Visit / Assessment: flat 2.5 hr. Included only when there's
    // existing construction to assess (Addition or Remodel).
    const siteVisitHours = 2.5;
    const siteVisitIncluded = (a.projectType === 'addition' || a.projectType === 'remodel');

    // Preliminary Review & Feasibility: 5% of raw work (pre-coord, pre-
    // setup) with a 0.5 hr floor. Always checked; user unchecks if truly
    // not doing any upfront review.
    const feasPct = 0.05;
    const feasFloor = 0.5;
    const feasHours = Math.max(rawWorkHours * feasPct, feasFloor);
    const feasIncluded = true;

    // Design Coordination + Early Design Assist: both 20% of Sealed Set.
    // Included flags driven by Design Stability:
    //   Locked        -> DC unchecked, EDA unchecked
    //   Mostly Locked -> DC checked,   EDA unchecked
    //   Fluid         -> DC checked,   EDA checked
    const dcPct = 0.20;
    const edaPct = 0.20;
    const dcHours = totalHours * dcPct;
    const edaHours = totalHours * edaPct;
    const dcIncluded  = (a.designStability === 'mostly_locked' || a.designStability === 'fluid');
    const edaIncluded = (a.designStability === 'fluid');
    const dsLabel = labelFor(DESIGN_STABILITY_OPTIONS, a.designStability) || a.designStability || 'mostly_locked';
    const ptLabel = labelFor(PROJECT_TYPE_OPTIONS, a.projectType) || a.projectType || 'new_construction';

    work.push({ label: 'Site Visit / Assessment', detail: `Flat 2.5 hr — typical residential site visit (travel + on-site documentation + photos). Auto-checked because Project Type is "${ptLabel}"${siteVisitIncluded ? '' : ' (so default is unchecked — no existing structure to assess)'}.`, value: formatNum(siteVisitHours) + ' hrs ' + (siteVisitIncluded ? '(included)' : '(unchecked)') });
    work.push({ label: 'Preliminary Review & Feasibility', detail: `5% of raw work for upfront feasibility review (max with a 0.5 hr minimum floor): max(${formatNum(rawWorkHours)} hr raw × 5% = ${formatNum(rawWorkHours * feasPct)} hr, floor ${feasFloor} hr) = ${formatNum(feasHours)} hr. Always checked; uncheck if truly skipped.`, value: formatNum(feasHours) + ' hrs ' + (feasIncluded ? '(included)' : '(unchecked)') });
    work.push({ label: 'Design Coordination', detail: `20% of Analysis & Design hours (${formatNum(totalHours)} × 20% = ${formatNum(dcHours)} hr) for meetings to resolve conditions during design. ${dcIncluded ? `Auto-checked because Design Stability is "${dsLabel}"` : `Default is unchecked because Design Stability is "${dsLabel}" (engineer-only scope; user can still check it)`}.`, value: formatNum(dcHours) + ' hrs ' + (dcIncluded ? '(included)' : '(unchecked)') });
    work.push({ label: 'Early Design Assist', detail: `20% of Analysis & Design hours (${formatNum(totalHours)} × 20% = ${formatNum(edaHours)} hr) for early-phase collaboration while geometry is still in flux. ${edaIncluded ? `Auto-checked because Design Stability is "${dsLabel}"` : `Default is unchecked because Design Stability is "${dsLabel}" (only triggers on Fluid)`}.`, value: formatNum(edaHours) + ' hrs ' + (edaIncluded ? '(included)' : '(unchecked)') });

    // ----- Step 10: Construction Phase Services (auto-populate) -----
    // CA percentage is additive across three independent axes (gravity,
    // lateral, project type), clamped at 35%. Each CA line item has a
    // floor so tiny projects don't drop below a minimum effort.
    // Submittal Review is zeroed out when there are no shop drawings.
    work.push({ heading: 'Step 10: Construction Phase Services' });
    work.push({ note: 'Auto-populates the three Construction Phase line items (Structural Observation, RFI Response, Submittal Review). The CA percentage adds modifiers from gravity system, lateral system, and project type to a 10% base. Each line has a minimum-hours floor so tiny projects don\'t drop below the bare-minimum CA effort. Submittal Review zeros out when no shop drawings are expected.' });

    const gravCaMod = caModifierFor(GRAVITY_SYSTEM_OPTIONS, a.gravitySystem);
    const latCaMod  = caModifierFor(LATERAL_SYSTEM_OPTIONS, a.lateralSystem);
    const projCaMod = caModifierFor(PROJECT_TYPE_OPTIONS, a.projectType);
    const projLabel = labelFor(PROJECT_TYPE_OPTIONS, a.projectType);
    const gravLabelForCa = labelFor(GRAVITY_SYSTEM_OPTIONS, a.gravitySystem);
    const latLabelForCa  = labelFor(LATERAL_SYSTEM_OPTIONS, a.lateralSystem);

    let caPct = CA_BASE_PCT + gravCaMod + latCaMod + projCaMod;
    const caPctClamped = Math.min(caPct, CA_CAP_PCT);
    const caTotal = rawWorkHours * caPctClamped;

    // Shop drawings assumed for any non-wood gravity system. For light wood,
    // the Truss Package dropdown determines whether submittal review applies.
    const hasShopDrawings = (a.gravitySystem !== 'light_wood_framing') || (a.trussPackage === 'yes');

    const obsHrs = Math.max(caTotal * CA_SPLIT.observation, CA_FLOORS.observation);
    const rfiHrs = Math.max(caTotal * CA_SPLIT.rfi,         CA_FLOORS.rfi);
    const subHrs = hasShopDrawings ? Math.max(caTotal * CA_SPLIT.submittal, CA_FLOORS.submittal) : 0;
    const caLineTotal = obsHrs + rfiHrs + subHrs;

    work.push({ label: 'CA Percentage', detail: `${(CA_BASE_PCT*100).toFixed(0)}% base + ${(gravCaMod*100).toFixed(0)}% gravity (${gravLabelForCa}) + ${(latCaMod*100).toFixed(0)}% lateral (${latLabelForCa}) + ${(projCaMod*100).toFixed(0)}% project type (${projLabel})${caPct > CA_CAP_PCT ? ` = ${(caPct*100).toFixed(0)}% capped at ${(CA_CAP_PCT*100).toFixed(0)}%` : ` = ${(caPctClamped*100).toFixed(0)}%`}`, value: (caPctClamped*100).toFixed(0) + '%' });
    work.push({ label: 'CA Total (before per-line floors)', detail: `${formatNum(rawWorkHours)} hr raw work × ${(caPctClamped*100).toFixed(0)}% CA = ${formatNum(caTotal)} hr`, value: formatNum(caTotal) + ' hrs' });
    work.push({ label: 'Shop drawings expected?', detail: hasShopDrawings ? 'Yes — Submittal Review activates (gravity system requires shop drawings, or Truss Package is set to Yes)' : 'No — Submittal Review skipped (Light Wood Framing without truss package = no shop drawings to review)', value: hasShopDrawings ? 'Yes' : 'No' });
    work.push({ label: 'Structural Observation', detail: `50% of CA total = ${formatNum(caTotal * CA_SPLIT.observation)} hr, floored at ${CA_FLOORS.observation} hr minimum (every project needs at least ~2 site visits) = ${formatNum(obsHrs)} hr`, value: formatNum(obsHrs) + ' hrs' });
    work.push({ label: 'RFI Response', detail: `40% of CA total = ${formatNum(caTotal * CA_SPLIT.rfi)} hr, floored at ${CA_FLOORS.rfi} hr minimum (every project gets a handful of field-condition RFIs) = ${formatNum(rfiHrs)} hr`, value: formatNum(rfiHrs) + ' hrs' });
    work.push({ label: 'Submittal Review', detail: hasShopDrawings ? `10% of CA total = ${formatNum(caTotal * CA_SPLIT.submittal)} hr, floored at ${CA_FLOORS.submittal} hr minimum = ${formatNum(subHrs)} hr` : 'Skipped — no shop drawings expected for this gravity system / truss combo', value: formatNum(subHrs) + ' hrs' });
    work.push({ label: 'CA Line Total', detail: `Sum of CA lines: ${formatNum(obsHrs)} obs + ${formatNum(rfiHrs)} RFI + ${formatNum(subHrs)} submittal = ${formatNum(caLineTotal)} hr`, value: formatNum(caLineTotal) + ' hrs', bold: true });

    // Apply auto-populated hours/dollars to state.lineItems so the Fee
    // Estimate table picks them up on next render. Hours and included
    // are overwritten on every Calculate; rate is PRESERVED so user
    // edits in the Fee Estimate table's Rate column stick across calcs.
    if (!state.lineItems) state.lineItems = makeInitialLineItems();
    const writeLine = (id, hrs, included) => {
      if (!state.lineItems[id]) state.lineItems[id] = { hours: 0, dollars: 0, included: true, rate: rateForLine(id) };
      const li = state.lineItems[id];
      if (typeof li.rate !== 'number' || li.rate <= 0) li.rate = rateForLine(id);
      li.hours = hrs;
      li.dollars = hrs * li.rate;
      if (typeof included === 'boolean') li.included = included;
    };
    writeLine('site_visit', siteVisitHours, siteVisitIncluded);
    writeLine('preliminary_feasibility', feasHours, feasIncluded);
    writeLine('early_design_assist', edaHours, edaIncluded);
    writeLine('design_coordination', dcHours, dcIncluded);
    writeLine('structural_observation', obsHrs, true);
    writeLine('rfi_response', rfiHrs, true);
    writeLine('submittal_review', subHrs, true);

    renderOutput(work, totalHours, rate);
  }

  function intOrZero(val) {
    const n = parseInt(val);
    return isNaN(n) ? 0 : n;
  }

  function escapeAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Migrates older saved states: legacy `projectName` becomes `projectAddress`,
  // legacy `notes` seeds the first Structures & Scope item, and missing
  // assumption fields are backfilled with defaults.
  function migrateImportedState(incoming) {
    const base = makeInitialState();
    const merged = Object.assign({}, base, incoming || {});
    if (!merged.projectAddress && incoming && incoming.projectName) {
      merged.projectAddress = incoming.projectName;
    }
    delete merged.projectName;
    if (!Array.isArray(merged.structuresScope)) merged.structuresScope = [];
    if (merged.structuresScope.length === 0 && incoming && incoming.notes) {
      merged.structuresScope.push({ id: nextStructureScopeId(), text: incoming.notes });
    }
    delete merged.notes;
    merged.assumptions = Object.assign({}, base.assumptions, merged.assumptions || {});
    // Legacy structuralSystem field is retired — replaced by two separate
    // gravitySystem + lateralSystem dropdowns. Drop the old value; the
    // defaults from base.assumptions apply.
    delete merged.assumptions.structuralSystem;
    // Foundation type list was trimmed to just slab-on-grade and pier-and-
    // beam. Anything else (drilled piers, helical, basement, etc.) maps to
    // slab-on-grade; the specialty complexity lives in concrete details
    // and specialty-details rather than the dropdown.
    const validFoundationTypes = new Set(FOUNDATION_TYPE_OPTIONS.map((o) => o.value));
    if (!validFoundationTypes.has(merged.assumptions.foundationType)) {
      merged.assumptions.foundationType = 'slab_on_grade';
    }
    // Migrate the legacy "sealed_set" line item id to the renamed
    // "structural_analysis_design". Preserves any user edits on that line.
    if (merged.lineItems && merged.lineItems.sealed_set && !merged.lineItems.structural_analysis_design) {
      merged.lineItems.structural_analysis_design = merged.lineItems.sealed_set;
    }
    if (merged.lineItems) delete merged.lineItems.sealed_set;
    // Backfill any missing line items so older saves render the new UI.
    const seedLines = makeInitialLineItems();
    if (!merged.lineItems || typeof merged.lineItems !== 'object') merged.lineItems = {};
    Object.keys(seedLines).forEach((id) => {
      if (!merged.lineItems[id]) merged.lineItems[id] = seedLines[id];
    });
    // Backfill rate on each line item — older saves predate per-line rates.
    Object.keys(merged.lineItems).forEach((id) => {
      const li = merged.lineItems[id];
      if (li && (typeof li.rate !== 'number' || li.rate <= 0)) li.rate = rateForLine(id);
    });
    return merged;
  }

  function formatNum(n) {
    if (Number.isInteger(n)) return n.toString();
    return parseFloat(n.toFixed(2)).toString();
  }

  function formatMoney(n) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  let lastCalculatedFee = 0;
  let adjustedHours = 0;
  let currentRate = 0;

  function updateSummaryFee() {
    const fee = adjustedHours * currentRate;
    lastCalculatedFee = fee;
    document.getElementById('summaryHours').textContent = formatNum(adjustedHours);
    document.getElementById('summaryFee').textContent = '$' + formatMoney(fee);
  }

  function renderOutput(work, totalHours, rate) {
    adjustedHours = totalHours;
    currentRate = rate;
    lastCalculatedFee = totalHours * rate;

    // Seed the auto-populated Structural Analysis and Design line item
    // from the latest calc. (Was "sealed_set" before the rename.) Rate
    // is preserved across recalcs to honor user edits in the Rate column.
    if (!state.lineItems) state.lineItems = makeInitialLineItems();
    const sad = state.lineItems.structural_analysis_design = state.lineItems.structural_analysis_design || { hours: 0, dollars: 0, included: true, rate: rate };
    if (typeof sad.rate !== 'number' || sad.rate <= 0) sad.rate = rate;
    sad.hours = totalHours;
    sad.dollars = totalHours * sad.rate;

    const outputDiv = document.getElementById('estimate-output');

    let html = `<div class="estimate-output">
      <div class="summary-banner">
        <div class="summary-item">
          <span class="summary-label">Analysis &amp; Design Hours</span>
          <div class="summary-adjust">
            <button class="btn-adjust" id="btnHoursDown" title="Decrease hours">−</button>
            <span class="summary-value" id="summaryHours">${formatNum(totalHours)}</span>
            <button class="btn-adjust" id="btnHoursUp" title="Increase hours">+</button>
          </div>
        </div>
        <div class="summary-item">
          <span class="summary-label">Analysis &amp; Design Fee</span>
          <span class="summary-value" id="summaryFee">$${formatMoney(lastCalculatedFee)}</span>
        </div>
        <div class="summary-item summary-action">
          <button class="btn btn-email" id="btnGenerateEmail">Generate Email</button>
          <button class="btn btn-email" id="btnGenerateProposal">Generate Proposal</button>
          <button class="btn btn-email" id="btnExport">Export Estimate</button>
        </div>
      </div>
      `;

    // Fee Estimate (line items) shows first — this is the actionable
    // output the user adjusts before producing a proposal. The calc
    // breakdown that produced Sealed Set follows below for reference.
    html += renderLineItemsTable();

    html += `<h2>Detailed Breakdown</h2>
      <table class="line-items">
        <thead><tr><th>Item</th><th>Calculation</th><th class="amount">Result</th></tr></thead>
        <tbody>`;

    work.forEach((row) => {
      if (row.heading) {
        html += `<tr class="step-heading"><td colspan="3">${row.heading}</td></tr>`;
      } else if (row.note) {
        html += `<tr class="step-note"><td colspan="3">${row.note}</td></tr>`;
      } else {
        const cls = row.bold ? ' class="row-bold"' : '';
        html += `<tr${cls}><td>${row.label}</td><td>${row.detail}</td><td class="amount">${row.value}</td></tr>`;
      }
    });

    html += `</tbody></table>`;
    html += `</div>`;
    outputDiv.innerHTML = html;

    bindLineItemHandlers();

    document.getElementById('btnGenerateEmail').addEventListener('click', () => {
      openEmailModal();
    });

    document.getElementById('btnGenerateProposal').addEventListener('click', () => {
      openProposalModal();
    });

    document.getElementById('btnExport').addEventListener('click', () => {
      exportProject();
    });

    // Helper to get the currently-saved rate for the SAD line so the +/-
    // buttons honor any rate edit the user made in the Fee Estimate
    // table (rather than always using the global Target $/Hour input).
    const sadRate = () => {
      const li = state.lineItems && state.lineItems.structural_analysis_design;
      return (li && typeof li.rate === 'number' && li.rate > 0) ? li.rate : currentRate;
    };

    document.getElementById('btnHoursUp').addEventListener('click', () => {
      adjustedHours += 1;
      const r = sadRate();
      lastCalculatedFee = adjustedHours * r;
      document.getElementById('summaryHours').textContent = formatNum(adjustedHours);
      document.getElementById('summaryFee').textContent = '$' + formatMoney(lastCalculatedFee);
      // Keep Structural Analysis and Design line item in sync so
      // proposal/export reflect the bump.
      state.lineItems.structural_analysis_design.hours = adjustedHours;
      state.lineItems.structural_analysis_design.dollars = adjustedHours * r;
      refreshLineItemRow('structural_analysis_design');
      refreshLineItemTotals();
    });

    document.getElementById('btnHoursDown').addEventListener('click', () => {
      if (adjustedHours >= 1) {
        adjustedHours -= 1;
        const r = sadRate();
        lastCalculatedFee = adjustedHours * r;
        document.getElementById('summaryHours').textContent = formatNum(adjustedHours);
        document.getElementById('summaryFee').textContent = '$' + formatMoney(lastCalculatedFee);
        state.lineItems.structural_analysis_design.hours = adjustedHours;
        state.lineItems.structural_analysis_design.dollars = adjustedHours * r;
        refreshLineItemRow('structural_analysis_design');
        refreshLineItemTotals();
      }
    });
  }

  // ---------- Line items (proposal-aligned fee breakdown) ----------

  function renderLineItemsTable() {
    if (!state.lineItems) state.lineItems = makeInitialLineItems();
    const phases = [];
    LINE_ITEM_DEFS.forEach((d) => {
      let p = phases.find((x) => x.name === d.phase);
      if (!p) { p = { name: d.phase, lines: [] }; phases.push(p); }
      p.lines.push(d);
    });

    let html = `<h2>Fee Estimate</h2>
      <table class="line-items li-fee-table">
        <thead>
          <tr>
            <th class="li-include">Inc.</th>
            <th>Line Item</th>
            <th class="amount">Hours</th>
            <th class="amount">Rate</th>
            <th class="amount">Fee</th>
          </tr>
        </thead>
        <tbody>`;

    phases.forEach((p) => {
      html += `<tr class="li-phase-header"><td colspan="5">${escapeAttr(p.name)}</td></tr>`;
      p.lines.forEach((d) => {
        const li = state.lineItems[d.id] || { hours: 0, dollars: 0, included: true, rate: rateForLine(d.id) };
        const stk = li.included ? '' : ' li-excluded';
        const lineRate = (typeof li.rate === 'number' && li.rate > 0) ? li.rate : rateForLine(d.id);
        html += `<tr class="li-row${stk}" data-line="${d.id}">
          <td class="li-include"><input type="checkbox" class="li-include-cb" data-line="${d.id}" ${li.included ? 'checked' : ''}></td>
          <td>${escapeAttr(d.label)}</td>
          <td class="amount"><input type="number" class="li-hrs" data-line="${d.id}" min="0" step="0.5" value="${formatNum(li.hours || 0)}"></td>
          <td class="amount"><input type="number" class="li-rate" data-line="${d.id}" min="0" step="5" value="${Math.round(lineRate)}"></td>
          <td class="amount"><input type="number" class="li-dollars" data-line="${d.id}" min="0" step="50" value="${Math.round(li.dollars || 0)}"></td>
        </tr>`;
      });
      html += `<tr class="li-phase-subtotal" data-phase="${escapeAttr(p.name)}">
        <td></td>
        <td><strong>${escapeAttr(p.name)} subtotal</strong></td>
        <td class="amount"><strong class="li-subtotal-hrs"></strong></td>
        <td></td>
        <td class="amount"><strong class="li-subtotal-dollars"></strong></td>
      </tr>`;
    });

    html += `<tr class="li-grand-total">
      <td></td>
      <td><strong>Grand Total</strong></td>
      <td class="amount"><strong id="liGrandHrs"></strong></td>
      <td></td>
      <td class="amount"><strong id="liGrandDollars"></strong></td>
    </tr>`;

    html += `</tbody></table>`;
    return html;
  }

  function bindLineItemHandlers() {
    document.querySelectorAll('.li-include-cb').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.line;
        state.lineItems[id].included = cb.checked;
        const row = document.querySelector(`.li-row[data-line="${id}"]`);
        if (row) row.classList.toggle('li-excluded', !cb.checked);
        refreshLineItemTotals();
      });
    });

    // Helper: read the line's persisted rate, falling back to the default.
    const lineRate = (id) => {
      const li = state.lineItems[id];
      const r = li && typeof li.rate === 'number' && li.rate > 0 ? li.rate : rateForLine(id);
      return r;
    };

    document.querySelectorAll('.li-hrs').forEach((input) => {
      input.addEventListener('input', () => {
        const id = input.dataset.line;
        const hrs = parseFloat(input.value) || 0;
        const r = lineRate(id);
        state.lineItems[id].hours = hrs;
        state.lineItems[id].dollars = hrs * r;
        const dollarsEl = document.querySelector(`.li-dollars[data-line="${id}"]`);
        if (dollarsEl) dollarsEl.value = Math.round(state.lineItems[id].dollars);
        refreshLineItemTotals();
      });
    });

    document.querySelectorAll('.li-rate').forEach((input) => {
      input.addEventListener('input', () => {
        const id = input.dataset.line;
        const r = parseFloat(input.value) || 0;
        state.lineItems[id].rate = r;
        // Recompute dollars from current hours × new rate.
        state.lineItems[id].dollars = (state.lineItems[id].hours || 0) * r;
        const dollarsEl = document.querySelector(`.li-dollars[data-line="${id}"]`);
        if (dollarsEl) dollarsEl.value = Math.round(state.lineItems[id].dollars);
        refreshLineItemTotals();
      });
    });

    document.querySelectorAll('.li-dollars').forEach((input) => {
      input.addEventListener('input', () => {
        const id = input.dataset.line;
        const dol = parseFloat(input.value) || 0;
        const r = lineRate(id);
        state.lineItems[id].dollars = dol;
        state.lineItems[id].hours = r > 0 ? dol / r : 0;
        const hrsEl = document.querySelector(`.li-hrs[data-line="${id}"]`);
        if (hrsEl) hrsEl.value = formatNum(state.lineItems[id].hours);
        refreshLineItemTotals();
      });
    });

    refreshLineItemTotals();
  }

  function refreshLineItemRow(id) {
    const li = state.lineItems[id];
    if (!li) return;
    const hrsEl = document.querySelector(`.li-hrs[data-line="${id}"]`);
    const rateEl = document.querySelector(`.li-rate[data-line="${id}"]`);
    const dolEl = document.querySelector(`.li-dollars[data-line="${id}"]`);
    if (hrsEl) hrsEl.value = formatNum(li.hours || 0);
    if (rateEl && typeof li.rate === 'number') rateEl.value = Math.round(li.rate);
    if (dolEl) dolEl.value = Math.round(li.dollars || 0);
  }

  function refreshLineItemTotals() {
    const phases = {};
    LINE_ITEM_DEFS.forEach((d) => {
      const li = state.lineItems[d.id];
      if (!li || !li.included) return;
      if (!phases[d.phase]) phases[d.phase] = { hours: 0, dollars: 0 };
      phases[d.phase].hours += li.hours || 0;
      phases[d.phase].dollars += li.dollars || 0;
    });
    document.querySelectorAll('.li-phase-subtotal').forEach((row) => {
      const name = row.dataset.phase;
      const sub = phases[name] || { hours: 0, dollars: 0 };
      row.querySelector('.li-subtotal-hrs').textContent = formatNum(sub.hours);
      row.querySelector('.li-subtotal-dollars').textContent = '$' + Math.round(sub.dollars).toLocaleString('en-US');
    });
    let totalHrs = 0, totalDol = 0;
    Object.values(phases).forEach((p) => { totalHrs += p.hours; totalDol += p.dollars; });
    const grandH = document.getElementById('liGrandHrs');
    const grandD = document.getElementById('liGrandDollars');
    if (grandH) grandH.textContent = formatNum(totalHrs);
    if (grandD) grandD.textContent = '$' + Math.round(totalDol).toLocaleString('en-US');
  }

  // Email Modal & Generation

  function openEmailModal() {
    const existing = document.getElementById('emailModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'emailModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <h2>Generate Email Template</h2>
        <p class="modal-subtitle">Engineering fee: <strong>$${formatMoney(lastCalculatedFee)}</strong></p>
        <div class="modal-form">
          <div class="form-group">
            <label for="emailFeasibility">Feasibility / Pre-Design Site Visit Fee ($)</label>
            <input type="number" id="emailFeasibility" min="0" step="100" value="0">
          </div>
          <div class="form-group">
            <label for="emailCA">Construction Administration (CA) Allowance ($)</label>
            <input type="number" id="emailCA" min="0" step="100" value="0">
          </div>
          <div class="form-group">
            <label for="emailWeeksEarliest">Earliest turnaround (weeks)</label>
            <input type="number" id="emailWeeksEarliest" min="1" step="1" value="4">
          </div>
          <div class="form-group">
            <label for="emailWeeksLatest">Latest turnaround (weeks)</label>
            <input type="number" id="emailWeeksLatest" min="1" step="1" value="6">
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" id="btnModalGenerate">Generate</button>
          <button class="btn btn-secondary" id="btnModalCancel">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btnModalCancel').addEventListener('click', () => modal.remove());

    document.getElementById('btnModalGenerate').addEventListener('click', () => {
      const feasibility = parseFloat(document.getElementById('emailFeasibility').value) || 0;
      const ca = parseFloat(document.getElementById('emailCA').value) || 0;
      const weeksMin = parseInt(document.getElementById('emailWeeksEarliest').value) || 4;
      const weeksMax = parseInt(document.getElementById('emailWeeksLatest').value) || 6;

      modal.remove();
      showEmailPreview(feasibility, lastCalculatedFee, ca, weeksMin, weeksMax);
    });
  }

  function showEmailPreview(feasibility, engineering, ca, weeksMin, weeksMax) {
    const existing = document.getElementById('emailPreviewModal');
    if (existing) existing.remove();

    const feasibilityLine = feasibility > 0
      ? `<b>Feasibility:</b> $${formatMoney(feasibility)}`
      : `<b>Feasibility:</b> <i>N/A</i>`;

    const caLine = ca > 0
      ? `<b>Construction Administration (CA) Allowance (optional):</b> $${formatMoney(ca)}`
      : `<b>Construction Administration (CA) Allowance (optional):</b> <i>N/A</i>`;

    const timelineText = weeksMin === weeksMax
      ? `${weeksMin} weeks`
      : `${weeksMin}\u2013${weeksMax} weeks`;

    const ulStyle = 'style="padding-left: 28px; margin: 8px 0;"';
    const liStyle = 'style="margin-bottom: 4px; list-style-type: disc;"';

    const emailHTML = `<div style="font-family: Arial, Helvetica, sans-serif; font-size: small; color: #000000; line-height: 1.5;">
<p style="margin: 0 0 10px 0;">My understanding of the scope is as follows: structural engineering services for [PROPOSED_SCOPE] at [PROJECT ADDRESS], including design and detailing for:</p>
<ul ${ulStyle}>
<li ${liStyle}>[Item 1]</li>
<li ${liStyle}>[Item 2]</li>
<li ${liStyle}>[Item 3]</li>
</ul>
<p style="margin: 10px 0;">Based on the current information, I believe your engineering budgets for this project should be as follows:</p>
<ul ${ulStyle}>
<li ${liStyle}>${feasibilityLine}</li>
<li ${liStyle}><b>Engineering (Design + Permit Set):</b> $${formatMoney(engineering)}</li>
<li ${liStyle}>${caLine}</li>
</ul>
<p style="margin: 10px 0;">Right now, we could have drawings ready in <b>${timelineText}</b>. However, that figure fluctuates along with our backlog. Once we have a signed contract and retainer, we can reserve you a spot on our schedule.</p>
<p style="margin: 10px 0;"><b>What\u2019s included (high level):</b></p>
<ul ${ulStyle}>
<li ${liStyle}>Structural review + design of major framing/foundations and lateral stability using standard hardware</li>
<li ${liStyle}>Typical coordination for architectural integration + common permit comments</li>
<li ${liStyle}>Limited construction-phase support (RFIs/submittal review) and site observations, if requested</li>
</ul>
<p style="margin: 10px 0;"><b>Assumptions / qualifications (important):</b></p>
<ul ${ulStyle}>
<li ${liStyle}><b>PDFs govern:</b> Engineering is based on the latest architect-issued, dimensioned PDF set. CAD/BIM (if provided) is non-governing and may not be reviewed; we do not verify CAD/PDF consistency.</li>
<li ${liStyle}><b>Geometry lock:</b> Architectural geometry is assumed frozen upon engineering start. Any changes to footprint, levels, rooflines, openings, or structural layout after start may affect fee and schedule.</li>
<li ${liStyle}><b>Connections:</b> Unless specifically detailed, connections use standard, commercially available hardware with published load data; custom/architectural connection design is excluded.</li>
<li ${liStyle}><b>Guardrails:</b> Guardrail systems are assumed to be prescriptive or manufacturer-engineered; we design only the supporting framing and blocking.</li>
<li ${liStyle}><b>Consultants:</b> Architectural, MEP, FP, civil, and geotechnical design are by others.</li>
<li ${liStyle}><b>Site Access:</b> Site access must allow standard visual observation without special equipment or confined-space requirements.</li>
<li ${liStyle}><b>Reimbursables:</b> Expenses such as municipal fees or specialty tools will be billed at cost with Client approval.</li>
</ul>
<p style="margin: 10px 0;">Please let me know if you\u2019d like to move forward.</p>
</div>`;

    const modal = document.createElement('div');
    modal.id = 'emailPreviewModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content modal-content-wide">
        <div class="modal-header-row">
          <h2>Email Preview</h2>
          <button class="btn btn-primary btn-copy" id="btnCopyEmail">Copy to Clipboard</button>
        </div>
        <div class="email-preview" id="emailPreviewContent">${emailHTML}</div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="btnEmailClose">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btnEmailClose').addEventListener('click', () => modal.remove());

    document.getElementById('btnCopyEmail').addEventListener('click', () => {
      const previewEl = document.getElementById('emailPreviewContent');
      const btn = document.getElementById('btnCopyEmail');

      function showCopied() {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy to Clipboard'; }, 2000);
      }

      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        const htmlContent = previewEl.innerHTML;
        const plainContent = previewEl.innerText;
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        const textBlob = new Blob([plainContent], { type: 'text/plain' });

        navigator.clipboard.write([
          new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob,
          })
        ]).then(showCopied).catch(() => {
          copyViaSelection(previewEl);
          showCopied();
        });
      } else {
        copyViaSelection(previewEl);
        showCopied();
      }
    });
  }

  function copyViaSelection(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('copy');
    selection.removeAllRanges();
  }

  // ---------- Generate Proposal (SE) ----------
  //
  // Builds an inline-styled HTML proposal mirroring Chris's SE template
  // (Engineering Proposal — Hourly). Copy/paste into Google Docs preserves
  // formatting because every element carries inline style rules.

  function labelFor(options, value) {
    const o = options.find((x) => x.value === value);
    return o ? o.label : (value || '');
  }

  function designStabilityPhrase(value) {
    const map = {
      locked:         'Locked (engineer only)',
      mostly_locked:  'Mostly Locked (minor coordination)',
      fluid:          'Fluid (early design assist)',
    };
    return map[value] || value || '';
  }

  function openProposalModal() {
    const existing = document.getElementById('seProposalModal');
    if (existing) existing.remove();

    const hrs = adjustedHours || 0;
    const cdDefault = hrs > 0 ? Math.ceil(hrs / 20) : 0;
    // Pre-populate Structural CA Fee from sum of CA-bucket line items.
    const caBucketIds = ['rfi_response', 'submittal_review', 'structural_observation'];
    const caBucketDollars = caBucketIds.reduce((s, id) => {
      const li = state.lineItems && state.lineItems[id];
      return s + (li && li.included ? (li.dollars || 0) : 0);
    }, 0);
    const caDefault = caBucketDollars > 0 ? Math.round(caBucketDollars) : '';

    const modal = document.createElement('div');
    modal.id = 'seProposalModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content modal-content-wide">
        <h2>Generate Proposal</h2>
        <p class="modal-subtitle">Fill in proposal-specific details, then preview and copy. Paste into Google Docs for a formatted proposal.</p>
        <div class="modal-form">
          <div class="form-row">
            <div class="form-group" style="flex:1">
              <label for="sePropProposedScope">Proposed scope (short phrase)</label>
              <input type="text" id="sePropProposedScope" placeholder="e.g. single-family residence with detached garage">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="flex:1">
              <label for="sePropCdWks">CD Due Date (weeks from start)</label>
              <input type="number" id="sePropCdWks" min="0" step="1" value="${cdDefault}">
            </div>
            <div class="form-group" style="flex:1">
              <label for="sePropCaFee">Structural CA Fee ($, optional)</label>
              <input type="number" id="sePropCaFee" min="0" step="100" value="${caDefault}" placeholder="Leave blank for [Structural CA Fee]">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="flex:1">
              <label for="sePropRetainer">Retainer amount ($)</label>
              <input type="number" id="sePropRetainer" min="0" step="100" value="5000">
            </div>
            <div class="form-group" style="flex:1; align-self:flex-end;">
              <label style="display:flex; align-items:center; gap:0.4rem; font-weight:normal;">
                <input type="checkbox" id="sePropRoundHours" checked>
                Round hours to whole numbers
              </label>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" id="sePropGenerate">Generate</button>
          <button class="btn btn-secondary" id="sePropCancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('sePropCancel').addEventListener('click', () => modal.remove());
    document.getElementById('sePropGenerate').addEventListener('click', () => {
      const caRaw = document.getElementById('sePropCaFee').value.trim();
      const inputs = {
        proposedScope: document.getElementById('sePropProposedScope').value || '',
        cdWks:         parseInt(document.getElementById('sePropCdWks').value) || 0,
        caFee:         caRaw === '' ? null : (parseFloat(caRaw) || 0),
        retainer:      parseFloat(document.getElementById('sePropRetainer').value) || 0,
        roundHours:    document.getElementById('sePropRoundHours').checked,
      };
      modal.remove();
      showProposalPreview(inputs);
    });
  }

  function showProposalPreview(inputs) {
    const existing = document.getElementById('seProposalPreviewModal');
    if (existing) existing.remove();

    const html = buildProposalHtml(inputs);

    const modal = document.createElement('div');
    modal.id = 'seProposalPreviewModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content modal-content-wide">
        <div class="modal-header-row">
          <h2>Proposal Preview</h2>
          <button class="btn btn-primary btn-copy" id="btnCopyProposal">Copy to Clipboard</button>
        </div>
        <div class="email-preview" id="proposalPreviewContent">${html}</div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="btnProposalClose">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('btnProposalClose').addEventListener('click', () => modal.remove());

    document.getElementById('btnCopyProposal').addEventListener('click', () => {
      const previewEl = document.getElementById('proposalPreviewContent');
      const btn = document.getElementById('btnCopyProposal');

      function showCopied() {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy to Clipboard'; }, 2000);
      }

      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        const htmlContent = previewEl.innerHTML;
        const plainContent = previewEl.innerText;
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        const textBlob = new Blob([plainContent], { type: 'text/plain' });

        navigator.clipboard.write([
          new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })
        ]).then(showCopied).catch(() => {
          copyViaSelection(previewEl);
          showCopied();
        });
      } else {
        copyViaSelection(previewEl);
        showCopied();
      }
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function buildProposalHtml(inputs) {
    // Shared styles — kept in sync with A/E proposal for paste fidelity.
    const font = 'font-family: Arial, Helvetica, sans-serif; font-size: 11pt; margin: 0 0 3pt 0;';
    const heading = 'font-family: Arial, Helvetica, sans-serif; font-size: 11pt; margin: 10pt 0 3pt 0; padding-left: 0; text-indent: 0;';

    const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
    const roundHours = inputs.roundHours !== false;
    const formatHrs = (n) => {
      const v = n || 0;
      return roundHours ? Math.round(v) : Math.round(v * 10) / 10;
    };

    const projectAddress = (state.projectAddress || '').trim() || '[Project Address]';
    const proposedScope  = (inputs.proposedScope || '').trim() || '[Proposed Scope]';

    const scopeItems = (state.structuresScope || []).filter((it) => (it.text || '').trim());
    const scopeBullets = scopeItems.length === 0
      ? `<li style="${font}">[Scope Item &mdash; add in the estimator]</li>`
      : scopeItems.map((it) => `<li style="${font}">${escapeHtml(it.text)}</li>`).join('');

    const a = state.assumptions || {};
    const designStability = designStabilityPhrase(a.designStability);
    const gravitySystem   = labelFor(GRAVITY_SYSTEM_OPTIONS, a.gravitySystem);
    const lateralSystem   = labelFor(LATERAL_SYSTEM_OPTIONS, a.lateralSystem);
    const foundationType  = labelFor(FOUNDATION_TYPE_OPTIONS, a.foundationType);
    const geotechReport   = labelFor(GEOTECH_REPORT_OPTIONS,    a.geotechReport);

    // Multi-row fee table built from the line items the user has set on the
    // estimate output. Lines are grouped by phase with subtotal rows; the
    // final row sums all included lines as "Total Structural Design Fee".
    const feeTableHtml = (() => {
      const liState = state.lineItems || {};
      const phases = [];
      LINE_ITEM_DEFS.forEach((d) => {
        const li = liState[d.id];
        if (!li || !li.included) return;
        if ((li.dollars || 0) <= 0 && (li.hours || 0) <= 0) return;
        let p = phases.find((x) => x.name === d.phase);
        if (!p) { p = { name: d.phase, lines: [] }; phases.push(p); }
        p.lines.push({ label: d.label, hours: li.hours || 0, dollars: li.dollars || 0 });
      });

      let grandH = 0, grandD = 0;
      const rows = [];
      phases.forEach((p) => {
        const subH = p.lines.reduce((s, l) => s + l.hours, 0);
        const subD = p.lines.reduce((s, l) => s + l.dollars, 0);
        grandH += subH;
        grandD += subD;
        rows.push(`<tr>
          <td style="${font} padding: 4pt 6pt 1pt 6pt; border-top: 1px solid #bbb;"><strong>${escapeHtml(p.name)}</strong></td>
          <td style="${font} padding: 4pt 6pt 1pt 6pt; border-top: 1px solid #bbb; text-align: right;"><strong>${formatHrs(subH)}</strong></td>
          <td style="${font} padding: 4pt 6pt 1pt 6pt; border-top: 1px solid #bbb; text-align: right;"><strong>${money(subD)}</strong></td>
        </tr>`);
        p.lines.forEach((l) => {
          rows.push(`<tr>
            <td style="${font} padding: 0 6pt 0 18pt;">${escapeHtml(l.label)}</td>
            <td style="${font} padding: 0 6pt; text-align: right;">${formatHrs(l.hours) || '—'}</td>
            <td style="${font} padding: 0 6pt; text-align: right;">${money(l.dollars)}</td>
          </tr>`);
        });
      });
      rows.push(`<tr>
        <td style="${font} padding: 6pt 6pt 2pt 6pt; border-top: 2px solid #555;"><strong>Total Structural Design Fee</strong></td>
        <td style="${font} padding: 6pt 6pt 2pt 6pt; border-top: 2px solid #555; text-align: right;"><strong>${formatHrs(grandH)}</strong></td>
        <td style="${font} padding: 6pt 6pt 2pt 6pt; border-top: 2px solid #555; text-align: right;"><strong>${money(grandD)} (+/- 10%)</strong></td>
      </tr>`);

      return `
        <table style="${font} border-collapse: collapse; width: 100%; margin: 3pt 0; line-height: 1.15;">
          <thead>
            <tr>
              <th style="${font} text-align: left;  padding: 2pt 6pt; border-bottom: 2px solid #555;">Phase</th>
              <th style="${font} text-align: right; padding: 2pt 6pt; border-bottom: 2px solid #555;">Hours</th>
              <th style="${font} text-align: right; padding: 2pt 6pt; border-bottom: 2px solid #555;">Fee</th>
            </tr>
          </thead>
          <tbody>${rows.join('')}</tbody>
        </table>`;
    })();

    const caFeeHtml = (inputs.caFee != null && inputs.caFee > 0)
      ? `<strong>${money(inputs.caFee)}</strong>`
      : '<strong>[Structural CA Fee]</strong>';

    const retainerHtml = (inputs.retainer && inputs.retainer > 0)
      ? `<strong>${money(inputs.retainer)}</strong>`
      : '<strong>[Retainer Amount]</strong>';

    const cdWks = inputs.cdWks && inputs.cdWks > 0 ? inputs.cdWks : '[CD Due Date]';

    return `<div style="${font} color: #000; line-height: 1.2;">
      <h1 style="${heading}"><strong>1. PROJECT DESCRIPTION</strong></h1>
      <p style="${font}">The project consists of structural engineering services for a proposed ${escapeHtml(proposedScope)} located at ${escapeHtml(projectAddress)}. The estimate that follows is based on the program and assumptions described in this section. Material changes to either may require an adjustment to the estimated fee and schedule.</p>
      <p style="${font}"><strong>The scope includes the design and detailing of:</strong></p>
      <ul style="${font}">${scopeBullets}</ul>
      <p style="${font}"><strong>Project Assumptions</strong></p>
      <ul style="${font}">
        <li style="${font}"><strong>Architectural Design:</strong> ${escapeHtml(designStability)}</li>
        <li style="${font}"><strong>Gravity System:</strong> ${escapeHtml(gravitySystem)}.</li>
        <li style="${font}"><strong>Lateral System:</strong> ${escapeHtml(lateralSystem)}.</li>
        <li style="${font}"><strong>Foundation Type:</strong> ${escapeHtml(foundationType)}.</li>
        <li style="${font}"><strong>Geotechnical Report:</strong> ${escapeHtml(geotechReport)}.</li>
      </ul>

      <h1 style="${heading}"><strong>2. SCOPE OF SERVICES</strong></h1>
      <p style="${font}"><strong>Pre-Design &mdash;</strong> Establish structural feasibility and provide early input on design direction before structural design formally begins.</p>
      <ul style="${font}">
        <li style="${font}"><strong>Early Design Assist:</strong> Consultation during the architect's or owner's early design development. Provides structural input on massing, span conditions, lateral strategy, and foundation approach while geometry is still flexible. Deliverables are typically narrative recommendations and sketches rather than sealed drawings.</li>
        <li style="${font}"><strong>Site Visit / Assessment:</strong> On-site evaluation to document existing conditions, perform preliminary framing/foundation analysis, and capture the space via photo and/or 360&deg; video.</li>
        <li style="${font}"><strong>Preliminary Review &amp; Feasibility:</strong> Evaluation of proposed scope against site and code constraints. Identifies structural feasibility concerns, system options, and cost drivers early enough to inform design decisions.</li>
      </ul>
      <p style="${font}"><strong>Design &mdash;</strong> Produce the sealed structural documents for the project, including the coordination work that feeds into them.</p>
      <ul style="${font}">
        <li style="${font}"><strong>Design Coordination:</strong> Ongoing coordination with the architect or designer as detailed design develops. Addresses structural decisions that emerge during design &mdash; connection approaches, member depth constraints, lateral bracing locations, and similar conditions that benefit from structural input before being locked in drawings.</li>
        <li style="${font}"><strong>Structural Analysis and Design:</strong> Complete structural drawings sealed for construction. Includes foundation plan, framing plans, schedules, structural details, and structural notes.</li>
      </ul>
      <p style="${font}"><strong>Construction &mdash;</strong> Support the project during construction in a structural advisory role.</p>
      <p style="${font}"><em>*The engineer is not the owner's contractual representative during construction, does not administer the construction contract, and does not provide continuous on-site inspection.</em></p>
      <ul style="${font}">
        <li style="${font}"><strong>RFI Response:</strong> Response to contractor Requests for Information on structural matters during construction.</li>
        <li style="${font}"><strong>Submittal Review:</strong> Review of structural shop drawings, product data, and samples for conformance with the design.</li>
        <li style="${font}"><strong>Structural Observation:</strong> Site observation at critical construction phases including pre-pour of foundation and rough framing. Includes letters of certification when observed conditions are code-compliant.</li>
      </ul>

      <h1 style="${heading}"><strong>3. TIMELINE &amp; DELIVERABLES</strong></h1>
      <p style="${font}">All timelines commence upon receipt of the signed contract, retainer payment, and final architectural backgrounds.</p>
      <p style="${font}"><strong>Pre-Design:</strong></p>
      <ul style="${font}">
        <li style="${font}"><strong>Deliverables:</strong> Ongoing Consultation, Site Visit / Assessment, Feasibility Findings</li>
        <li style="${font}"><strong>Approximate Due Date:</strong> ASAP</li>
      </ul>
      <p style="${font}"><strong>Design:</strong></p>
      <ul style="${font}">
        <li style="${font}"><strong>Deliverables:</strong> Coordination Set(s) (as needed), Final Approval Set for Client Review</li>
        <li style="${font}"><strong>Approximate Due Date:</strong> ${cdWks} weeks</li>
        <li style="${font}"><em>Note: Sealed set will be delivered 1&ndash;2 weeks after client approval.</em></li>
      </ul>
      <p style="${font}"><strong>Construction:</strong></p>
      <ul style="${font}">
        <li style="${font}"><strong>Deliverables:</strong> Responses to Requests for Information (RFIs), pre-pour and framing observations and markups, shop drawing review</li>
        <li style="${font}"><strong>Due Date:</strong> Ongoing through substantial completion.</li>
        <li style="${font}"><em>*See "Compensation" section for fees and limitations.</em></li>
      </ul>

      <h1 style="${heading}"><strong>4. COMPENSATION</strong></h1>
      <p style="${font}"><strong>Estimate:</strong> The following estimates are based on an anticipated effort to complete each phase based on the scope defined in the earlier section.</p>
      ${feeTableHtml}
      <p style="${font} margin-left: 30px; margin-right: 30px;"><strong>Note:</strong> Okkem Design typically completes projects of this type within approximately 10% of the estimated fee. Should projected fees exceed this threshold due to scope changes or unforeseen conditions, we will notify the Client and provide a revised estimate for approval.</p>
      <p style="${font}"><strong>Structural Construction Phase Services:</strong> Based on the current scope and assumptions, Okkem Design anticipates a Structural "Construction Phase" fee of ${caFeeHtml}.</p>
      <p style="${font}">This fee will be confirmed in a separate communication issued after the completion of the Structural Design phase.</p>
      <p style="${font}"><strong>Hourly Rate Schedule</strong></p>
      <ul style="${font}">
        <li style="${font}">Licensed Design Professional: $190/hr</li>
        <li style="${font}">Project Coordination: $160/hr</li>
        <li style="${font}">Non-Licensed Staff: $130/hr</li>
      </ul>

      <h1 style="${heading}"><strong>5. PAYMENT TERMS</strong></h1>
      <ul style="${font}">
        <li style="${font}"><strong>Retainer:</strong> A ${retainerHtml} retainer is required to initiate services. The retainer will be applied to the final invoice. Any unused balance will be refunded at project completion.</li>
        <li style="${font}"><strong>Invoicing:</strong> Invoices are typically issued when accumulated fees exceed $2,000, upon delivery of a major milestone, or prior to a project pause.</li>
        <li style="${font}"><strong>Terms:</strong> Payment is due within 7 days of invoice issuance. Unpaid invoices may result in a pause in services. All outstanding invoices must be paid in full prior to release of the final sealed drawings.</li>
      </ul>

      <h1 style="${heading}"><strong>6. ASSUMPTIONS &amp; EXCLUSIONS</strong></h1>
      <ul style="${font}">
        <li style="${font}"><strong>Design Freeze:</strong> Architectural geometry is assumed frozen upon engineering start. Any changes to footprint, levels, rooflines, openings, or structural layout after start require revisions and may affect fee and schedule.</li>
        <li style="${font}"><strong>Architectural Reference:</strong> Structural design is based on the latest architect-issued, dimensioned PDF drawings. CAD/BIM files (if provided) are non-governing and may not be reviewed. We do not verify consistency between CAD/BIM and PDFs; PDFs control.</li>
        <li style="${font}"><strong>Connections:</strong> Unless specifically detailed in the architectural drawings, connections use standard, commercially available hardware with published load data; custom/architectural connection design is excluded.</li>
        <li style="${font}"><strong>Guardrails:</strong> Guardrail systems are assumed to be prescriptive or manufacturer-engineered; Okkem Design will design only the supporting framing and blocking.</li>
        <li style="${font}"><strong>Consultants:</strong> Architectural, MEP, FP, civil, and geotechnical design are by others.</li>
        <li style="${font}"><strong>Site Access:</strong> Site access must allow standard visual observation without special equipment or confined-space requirements.</li>
        <li style="${font}"><strong>Reimbursable Expenses:</strong> Expenses such as municipal fees or specialty tools will be billed at cost with Client approval.</li>
        <li style="${font}"><strong>Specific Exclusions:</strong> [List additional Exclusions as needed]</li>
      </ul>
    </div>`;
  }

  function saveForm() {
    if (document.getElementById('projectAddress')) readFormIntoState();
  }

  // Expose public API (kept for diagnostics; page initializes itself below).
  window.seEstimate = {
    render,
    saveForm,
    getState: () => state,
    getProjectName: () => state.projectAddress || state.clientName || '',
    setState: (newState) => {
      state = migrateImportedState(newState);
      initCornerOutlines();
      rebuildForm();
    },
    reset: () => {
      resetState();
      rebuildForm();
    },
  };

  // Initial render — runs as the page loads.
  render();
})();
