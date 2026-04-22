// SE Estimate — Residential Structural Engineering estimate module

(function () {
  const app = document.getElementById('app');

  const DESIGN_STABILITY_OPTIONS = [
    { value: 'locked',        label: 'Locked (engineer only)' },
    { value: 'mostly_locked', label: 'Mostly Locked (minor coordination)' },
    { value: 'fluid',         label: 'Fluid (early design assist)' },
  ];
  const STRUCTURAL_SYSTEM_OPTIONS = [
    { value: 'wood_framing',   label: 'Light-frame wood' },
    { value: 'wood_steel',     label: 'Light-frame wood + structural steel' },
    { value: 'cfs_steel',      label: 'Cold-formed steel + structural steel' },
    { value: 'steel_cfs',      label: 'Structural steel + cold-formed steel' },
    { value: 'masonry',        label: 'Masonry (CMU)' },
    { value: 'icf',            label: 'Insulated concrete forms (ICF)' },
    { value: 'cast_in_place',  label: 'Cast-in-place concrete' },
    { value: 'tilt_up',        label: 'Tilt-up concrete' },
    { value: 'hybrid_other',   label: 'Hybrid / other' },
  ];
  const FOUNDATION_TYPE_OPTIONS = [
    { value: 'slab_on_grade',  label: 'Slab-on-grade' },
    { value: 'post_tensioned', label: 'Post-tensioned slab' },
    { value: 'pier_beam',      label: 'Pier and beam' },
    { value: 'drilled_piers',  label: 'Drilled piers + grade beams' },
    { value: 'helical_piers',  label: 'Helical piers' },
    { value: 'basement',       label: 'Basement' },
    { value: 'mat_slab',       label: 'Mat slab' },
    { value: 'other',          label: 'Other' },
  ];
  const GEOTECH_REPORT_OPTIONS = [
    { value: 'provided',            label: 'Provided' },
    { value: 'waived_nonexpansive', label: 'Waived (non-expansive assumed)' },
    { value: 'to_be_provided',      label: 'To be provided' },
  ];

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
        structuralSystem: 'wood_framing',
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
              <label for="structuralSystem">Structural System</label>
              <select id="structuralSystem">
                ${STRUCTURAL_SYSTEM_OPTIONS.map((o) => `<option value="${o.value}" ${state.assumptions.structuralSystem === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-row">
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
              <label for="roofCount">Roof Count</label>
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
              <label for="plateHeightSets">Distinct Plate-Height Sets</label>
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
    const designStabilityEl  = document.getElementById('designStability');
    const structuralSystemEl = document.getElementById('structuralSystem');
    const foundationTypeEl   = document.getElementById('foundationType');
    const geotechReportEl    = document.getElementById('geotechReport');
    if (designStabilityEl)  state.assumptions.designStability  = designStabilityEl.value;
    if (structuralSystemEl) state.assumptions.structuralSystem = structuralSystemEl.value;
    if (foundationTypeEl)   state.assumptions.foundationType   = foundationTypeEl.value;
    if (geotechReportEl)    state.assumptions.geotechReport    = geotechReportEl.value;

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
    work.push({ note: 'Formula per outline: Squares = (Corners ÷ 2) − 1' });

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

    work.push({ label: 'Foundation Squares (slab)', detail: '', value: formatNum(foundationSquares) + ' sq', bold: false });
    work.push({ label: 'Framing Squares', detail: framingKeys.map((k) => formatNum(layerSquares[k])).join(' + '), value: formatNum(framingSquares) + ' sq', bold: false });
    if (state.pierAndBeamPresent) {
      work.push({ label: 'Pier & Beam Squares', detail: '', value: formatNum(pierAndBeamSquares) + ' sq', bold: false });
    }
    work.push({ label: 'Roof Count', detail: '', value: state.roofCount, bold: false });
    work.push({ label: 'Total Squares', detail: formatNum(foundationSquares) + ' + ' + formatNum(framingSquares) + (state.pierAndBeamPresent ? ' + ' + formatNum(pierAndBeamSquares) : ''), value: formatNum(totalSquares) + ' sq', bold: true });

    work.push({ heading: 'Step 2: Base Hours' });

    const setupHours = 4;

    const fndLevelHours = state.foundationLevels * 1;
    const fndSquareHours = foundationSquares * 1;
    const foundationHours = fndLevelHours + fndSquareHours;

    const framingSquareHours = 3 * framingSquares;

    const roofLevelHours = state.roofLevels * 1;
    const roofCountHours = state.roofCount * 2;
    const roofHours = roofLevelHours + roofCountHours;

    const minorConcreteHours = 3 * state.minorConcreteDetails;
    const majorConcreteHours = 6 * state.majorConcreteDetails;
    const manualConcreteHours = (state.manualConcreteDetails || []).reduce((sum, item) => sum + (item.hours || 0), 0);
    const concreteHours = minorConcreteHours + majorConcreteHours + manualConcreteHours;

    work.push({ label: 'Fixed setup', detail: '', value: formatNum(setupHours) + ' hrs' });
    work.push({ label: 'Foundation', detail: `${state.foundationLevels} lvl × 1 hr + ${formatNum(foundationSquares)} sq × 1 hr`, value: formatNum(foundationHours) + ' hrs' });
    work.push({ label: 'Framing squares', detail: `${formatNum(framingSquares)} sq × 3 hrs`, value: formatNum(framingSquareHours) + ' hrs' });

    const pierAndBeamHours = state.pierAndBeamPresent ? 2 * pierAndBeamSquares : 0;
    if (state.pierAndBeamPresent) {
      work.push({ label: 'Pier & beam framing', detail: `${formatNum(pierAndBeamSquares)} sq × 2 hrs`, value: formatNum(pierAndBeamHours) + ' hrs' });
    }
    work.push({ label: 'Roof', detail: `${state.roofLevels} lvl × 1 hr + ${state.roofCount} count × 2 hrs`, value: formatNum(roofHours) + ' hrs' });
    const concreteParts = [];
    if (state.minorConcreteDetails > 0) concreteParts.push(`${state.minorConcreteDetails} minor × 3 hrs = ${formatNum(minorConcreteHours)}`);
    if (state.majorConcreteDetails > 0) concreteParts.push(`${state.majorConcreteDetails} major × 6 hrs = ${formatNum(majorConcreteHours)}`);
    if (manualConcreteHours > 0) concreteParts.push(`manual: ${formatNum(manualConcreteHours)} hrs`);
    work.push({ label: 'Concrete details', detail: concreteParts.length ? concreteParts.join(', ') : 'none', value: formatNum(concreteHours) + ' hrs' });

    const baseHours = setupHours + foundationHours + framingSquareHours + pierAndBeamHours + roofHours + concreteHours;
    const baseParts = [setupHours, foundationHours, framingSquareHours, pierAndBeamHours, roofHours, concreteHours].map(formatNum).join(' + ');
    work.push({ label: 'Base Hours Total', detail: baseParts, value: formatNum(baseHours) + ' hrs', bold: true });

    let lateralHours = 0;
    if (state.lateralRequired) {
      work.push({ heading: 'Step 3: Lateral Hours' });
      work.push({ note: '3 hrs per level base + weighted problematic brace lines × 4 hrs' });

      const lateralBaseHours = 3 * state.stories;
      work.push({ label: 'Lateral base', detail: `${state.stories} level${state.stories > 1 ? 's' : ''} × 3 hrs`, value: formatNum(lateralBaseHours) + ' hrs' });

      const L1 = state.problematicBraceLines.level1 || 0;
      const L2 = state.problematicBraceLines.level2 || 0;
      const L3 = state.problematicBraceLines.level3 || 0;
      const L4 = state.problematicBraceLines.level4 || 0;

      const weightedParts = [];
      const weightedValues = [];
      if (state.stories >= 1) { weightedParts.push(`L1: ${L1} × 1.0 = ${formatNum(L1 * 1.0)}`); weightedValues.push(L1 * 1.0); }
      if (state.stories >= 2) { weightedParts.push(`L2: ${L2} × 1.5 = ${formatNum(L2 * 1.5)}`); weightedValues.push(L2 * 1.5); }
      if (state.stories >= 3) { weightedParts.push(`L3: ${L3} × 2.0 = ${formatNum(L3 * 2.0)}`); weightedValues.push(L3 * 2.0); }
      if (state.stories >= 4) { weightedParts.push(`L4: ${L4} × 2.5 = ${formatNum(L4 * 2.5)}`); weightedValues.push(L4 * 2.5); }

      const weightedSum = weightedValues.reduce((a, b) => a + b, 0);
      lateralHours = lateralBaseHours + 4 * weightedSum;

      weightedParts.forEach((p) => work.push({ label: '', detail: p, value: '' }));
      work.push({ label: 'Weighted sum', detail: weightedValues.map(formatNum).join(' + '), value: formatNum(weightedSum) });
      work.push({ label: 'Lateral Hours', detail: `${formatNum(lateralBaseHours)} + 4 × ${formatNum(weightedSum)}`, value: formatNum(lateralHours) + ' hrs', bold: true });
    } else {
      work.push({ heading: 'Step 3: Lateral Hours (Not Required)' });
      work.push({ label: 'Lateral Hours', detail: 'Lateral analysis not required', value: '0 hrs', bold: true });
    }

    work.push({ heading: 'Step 4: Modifier Hours' });

    const discHours = 4 * state.discontinuities;
    const span16Hours = 2 * state.span16to24Count;
    const spanOver24Hours = 6 * state.spanOver24Count;
    const vaultHours = 3 * state.vaultZones;
    const plateExtra = Math.max(state.plateHeightSets - 1, 0);
    const plateHours = 2 * plateExtra;
    const voidHours = 2 * state.voidsPenetrations;
    const cantileverHours = 2 * state.cantileverAreas;
    const specialtyHours = (state.specialtyDetails || []).reduce((sum, item) => sum + (item.hours || 0), 0);

    work.push({ label: 'Discontinuities', detail: `${state.discontinuities} × 4 hrs`, value: formatNum(discHours) + ' hrs' });
    work.push({ label: 'Spans 16–24 ft', detail: `${state.span16to24Count} × 2 hrs`, value: formatNum(span16Hours) + ' hrs' });
    work.push({ label: 'Spans >24 ft', detail: `${state.spanOver24Count} × 6 hrs`, value: formatNum(spanOver24Hours) + ' hrs' });
    work.push({ label: 'Vault zones', detail: `${state.vaultZones} × 3 hrs`, value: formatNum(vaultHours) + ' hrs' });
    work.push({ label: 'Plate-height sets', detail: `(${state.plateHeightSets} − 1) × 2 hrs = ${plateExtra} × 2`, value: formatNum(plateHours) + ' hrs' });
    work.push({ label: 'Voids / penetrations', detail: `${state.voidsPenetrations} × 2 hrs`, value: formatNum(voidHours) + ' hrs' });
    work.push({ label: 'Cantilever areas', detail: `${state.cantileverAreas} × 2 hrs`, value: formatNum(cantileverHours) + ' hrs' });
    work.push({ label: 'Specialty', detail: specialtyHours > 0 ? `manual: ${formatNum(specialtyHours)} hrs` : 'none', value: formatNum(specialtyHours) + ' hrs' });
    work.push({ label: 'Lateral (from Step 3)', detail: '', value: formatNum(lateralHours) + ' hrs' });

    const modifierHours = discHours + span16Hours + spanOver24Hours + vaultHours + plateHours + voidHours + cantileverHours + specialtyHours + lateralHours;
    const modParts = [discHours, span16Hours, spanOver24Hours, vaultHours, plateHours, voidHours, cantileverHours, specialtyHours, lateralHours].map(formatNum).join(' + ');
    work.push({ label: 'Modifier Hours Total', detail: modParts, value: formatNum(modifierHours) + ' hrs', bold: true });

    work.push({ heading: 'Step 5: Total Estimated Hours' });

    const subtotalHours = baseHours + modifierHours;
    work.push({ label: 'Base + Modifiers', detail: `${formatNum(baseHours)} + ${formatNum(modifierHours)}`, value: formatNum(subtotalHours) + ' hrs', bold: true });

    const coordinationMultiplier = state.squareFootage * 0.00001 + 1;
    work.push({ label: 'Coordination multiplier', detail: `${formatNum(state.squareFootage)} sf × 0.00001 + 1 = ${formatNum(coordinationMultiplier)}`, value: '×' + formatNum(coordinationMultiplier) });

    const totalHours = subtotalHours * coordinationMultiplier;
    work.push({ label: 'Adjusted total', detail: `${formatNum(subtotalHours)} × ${formatNum(coordinationMultiplier)}`, value: formatNum(totalHours) + ' hrs', bold: true });

    const rate = state.dollarPerHour;
    const fee = totalHours * rate;
    work.push({ heading: 'Fee Estimate' });
    work.push({ label: 'Rate', detail: '', value: '$' + formatNum(rate) + ' /hr' });
    work.push({ label: 'Fee', detail: `${formatNum(totalHours)} hrs × $${formatNum(rate)}`, value: '$' + formatMoney(fee), bold: true });

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
    const outputDiv = document.getElementById('estimate-output');

    let html = `<div class="estimate-output">
      <div class="summary-banner">
        <div class="summary-item">
          <span class="summary-label">Estimated Hours</span>
          <div class="summary-adjust">
            <button class="btn-adjust" id="btnHoursDown" title="Decrease hours">−</button>
            <span class="summary-value" id="summaryHours">${formatNum(totalHours)}</span>
            <button class="btn-adjust" id="btnHoursUp" title="Increase hours">+</button>
          </div>
        </div>
        <div class="summary-item">
          <span class="summary-label">Estimated Fee</span>
          <span class="summary-value" id="summaryFee">$${formatMoney(lastCalculatedFee)}</span>
        </div>
        <div class="summary-item summary-action">
          <button class="btn btn-email" id="btnGenerateEmail">Generate Email</button>
          <button class="btn btn-email" id="btnExport">Export Estimate</button>
        </div>
      </div>
      <h2>Detailed Breakdown</h2>
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

    html += `</tbody></table></div>`;
    outputDiv.innerHTML = html;

    document.getElementById('btnGenerateEmail').addEventListener('click', () => {
      openEmailModal();
    });

    document.getElementById('btnExport').addEventListener('click', () => {
      exportProject();
    });

    document.getElementById('btnHoursUp').addEventListener('click', () => {
      adjustedHours += 1;
      updateSummaryFee();
    });

    document.getElementById('btnHoursDown').addEventListener('click', () => {
      if (adjustedHours >= 1) {
        adjustedHours -= 1;
        updateSummaryFee();
      }
    });
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
