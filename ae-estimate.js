// A/E Estimate — Architecture + Engineering full-scope fee estimate module

(function () {
  const app = document.getElementById('app');

  // ---------- Line/section definitions ----------

  const LINE_LABELS = {
    site_visit: 'Site Visit / Assessment',
    scan: '3D Scan',
    base_model: 'Base Model',
    as_builts: 'As-Builts',
    feasibility_concept: 'Feasibility / Concept',
    schematic_design: 'Schematic Design',
    design_development: 'Design Development',
    permit_set: 'Permit Set',
    bid_set: 'Bid Set',
    construction_set: 'Construction Set',
    structural_engineering: 'Structural Engineering',
    bidding_negotiation: 'Bidding / Negotiation',
    permit_submittals: 'Permit Submittals',
    city_comment_revisions: 'City Comment Revisions',
    design_ca: 'Design CA',
    structural_ca: 'Structural CA',
  };

  const MANUAL_LINES = new Set([
    'site_visit', 'scan', 'base_model', 'as_builts', 'permit_submittals',
  ]);

  const SECTIONS = [
    { id: 'pre-design',             label: 'Pre-Design',                  lineIds: ['site_visit', 'scan', 'base_model', 'as_builts', 'feasibility_concept'] },
    { id: 'design',                 label: 'Design',                      lineIds: ['schematic_design', 'design_development'] },
    { id: 'cd',                     label: 'Construction Documents',      lineIds: ['permit_set', 'bid_set', 'construction_set'] },
    { id: 'structural-engineering', label: 'Structural Engineering',      lineIds: ['structural_engineering'] },
    { id: 'construction-phase',     label: 'Construction Phase Services', lineIds: ['bidding_negotiation', 'permit_submittals', 'city_comment_revisions', 'design_ca', 'structural_ca'] },
    { id: 'additional-services',    label: 'Additional Services',         lineIds: [] },
  ];

  const SCOPE_TYPES = ['remodel', 'addition', 'new_construction'];
  const SCOPE_TYPE_LABELS = { remodel: 'Remodel', addition: 'Addition', new_construction: 'New' };

  // ---------- State ----------

  let state = makeInitialState();
  const collapsedSections = new Set();

  function makeScope(name, condSf, condSpaces, uncondSf, uncondSpaces, type) {
    return {
      id: 'scope_' + Math.random().toString(36).slice(2, 10),
      name: name || '',
      type: SCOPE_TYPES.includes(type) ? type : 'new_construction',
      conditionedSf: condSf || 0,
      conditionedSpaces: condSpaces || 0,
      unconditionedSf: uncondSf || 0,
      unconditionedSpaces: uncondSpaces || 0,
    };
  }

  function normalizeScopes(scopes) {
    return (scopes || []).map((s) => {
      if (!s) return makeScope('', 0, 0, 0, 0);
      if (!SCOPE_TYPES.includes(s.type)) s.type = 'new_construction';
      return s;
    });
  }

  function sumScopes(scopes) {
    return (scopes || []).reduce((acc, s) => {
      acc.conditionedSf       += (s.conditionedSf || 0);
      acc.conditionedSpaces   += (s.conditionedSpaces || 0);
      acc.unconditionedSf     += (s.unconditionedSf || 0);
      acc.unconditionedSpaces += (s.unconditionedSpaces || 0);
      return acc;
    }, { conditionedSf: 0, conditionedSpaces: 0, unconditionedSf: 0, unconditionedSpaces: 0 });
  }

  // Default-able program inputs + line include/exclude toggles that
  // participate in "Save as Default". Per-project fields (identity,
  // manualHours, line dollar overrides, additional services, etc.) are NOT
  // part of this snapshot.
  function shippedProgramDefaults() {
    return {
      scopes: [makeScope('Area 1', 3000, 18, 500, 2)],
      buildGrade: 'mid_custom',
      structuralComplexity: 'medium',
      buildingCategory: '7',
      projectComplexity: 'simple',
      regionalMultiplier: 1.15,
      lineExclusions: {},
    };
  }

  // Returns the user's saved program defaults (flat shape), falling back to
  // shipped values for any missing fields. Always returns a fresh,
  // deep-cloned object.
  function loadEffectiveProgramDefaults() {
    const stored = window.aeConfig.loadProgramDefaults();
    const shipped = shippedProgramDefaults();
    const merged = stored ? Object.assign(shipped, stored) : shipped;
    if (!Array.isArray(merged.scopes) || merged.scopes.length === 0) {
      merged.scopes = shippedProgramDefaults().scopes;
    }
    merged.scopes = normalizeScopes(merged.scopes);
    if (!merged.lineExclusions || typeof merged.lineExclusions !== 'object') merged.lineExclusions = {};
    return window.aeConfig.deepClone(merged);
  }

  // Pull the default-able subset out of state (program fields + line
  // exclusions). Matches the flat shape returned by loadEffectiveProgramDefaults.
  function extractProgramDefaults(s) {
    const p = s.program || {};
    return {
      scopes: window.aeConfig.deepClone(p.scopes || []),
      buildGrade: p.buildGrade,
      structuralComplexity: p.structuralComplexity,
      buildingCategory: p.buildingCategory,
      projectComplexity: p.projectComplexity,
      regionalMultiplier: p.regionalMultiplier,
      lineExclusions: window.aeConfig.deepClone(s.lineExclusions || {}),
    };
  }

  // Apply a flat defaults object back into state (program fields + exclusions).
  function applyDefaultsToState(defaults) {
    const { lineExclusions, ...programFields } = defaults;
    Object.assign(state.program, programFields);
    state.lineExclusions = lineExclusions || {};
  }

  function makeInitialState() {
    const defaults = loadEffectiveProgramDefaults();
    const { lineExclusions, ...program } = defaults;
    return {
      identity: {
        projectAddress: '',
        clientName: '',
      },
      programItems: [],
      program,
      stage1Overrides: {
        conditionedRate: null,
        unconditionedRate: null,
        constructionCost: null,
      },
      stage2: {
        activeFlags: [],
      },
      manualHours: {
        site_visit: 0,
        scan: 0,
        base_model: 0,
        as_builts: 0,
        permit_submittals: 0,
      },
      additionalServices: [],
      lineOverrides: {},
      lineExclusions: lineExclusions || {},
      config: null, // populated lazily from aeConfig.loadConfig(); preserved across reset()
    };
  }

  function ensureConfig() {
    if (!state.config) {
      state.config = window.aeConfig.loadConfig();
    }
    normalizeConfig(state.config);
    return state.config;
  }

  function normalizeConfig(cfg) {
    if (typeof cfg.builderBaseConditionedSf !== 'number' || cfg.builderBaseConditionedSf <= 0) {
      cfg.builderBaseConditionedSf = 140;
    }
    // Drop legacy per-grade tables — derived now.
    delete cfg.buildGrades;
    delete cfg.buildGradeLabels;
    // Drop legacy "feasibility" line — superseded by feasibility_concept.
    if (cfg.hourlyRates) delete cfg.hourlyRates.feasibility;
    // Permit set base factor (was implicit 1.0).
    if (typeof cfg.permitSetBaseFactor !== 'number') cfg.permitSetBaseFactor = 0.8;
    // City comments now reads as % of permit set, not % of architect share.
    if (typeof cfg.cityCommentsPctOfPermitSet !== 'number') cfg.cityCommentsPctOfPermitSet = 0.25;
    delete cfg.cityCommentsBasePct;
    // Drop legacy city comments adder from each flag.
    if (Array.isArray(cfg.regulatoryFlags)) {
      cfg.regulatoryFlags.forEach((f) => { delete f.cityCommentsAdder; });
    }
  }

  // ---------- Calculation (pure) ----------

  function calculate(s, cfg) {
    // Stage 1
    const grades = window.aeConfig.deriveBuildGrades(cfg.builderBaseConditionedSf);
    const grade = grades[s.program.buildGrade] || grades.mid_custom;
    const baseline = { conditioned: grade.conditioned, unconditioned: grade.unconditioned };

    const structuralMult1 = cfg.structuralMultipliers.stage1[s.program.structuralComplexity] || 1.0;
    const totals = sumScopes(s.program.scopes);
    const totalSf = totals.conditionedSf + totals.unconditionedSf;
    const sizeMult = window.aeConfig.sizeCurveMultiplier(totalSf, cfg.sizeCurve);

    const condDensity = totals.conditionedSf > 0
      ? (totals.conditionedSpaces / totals.conditionedSf) * 1000
      : 0;
    const uncondDensity = totals.unconditionedSf > 0
      ? (totals.unconditionedSpaces / totals.unconditionedSf) * 1000
      : 0;

    const condDensityMult = window.aeConfig.densityCurveMultiplier(condDensity, cfg.conditionedDensityCurve);
    const uncondDensityMult = window.aeConfig.densityCurveMultiplier(uncondDensity, cfg.unconditionedDensityCurve);

    const regionalMult = (s.program.regionalMultiplier > 0) ? s.program.regionalMultiplier : 1.0;

    const calcCondRate   = baseline.conditioned   * structuralMult1 * sizeMult * condDensityMult   * regionalMult;
    const calcUncondRate = baseline.unconditioned * structuralMult1 * sizeMult * uncondDensityMult * regionalMult;

    const effCondRate   = s.stage1Overrides.conditionedRate   != null ? s.stage1Overrides.conditionedRate   : calcCondRate;
    const effUncondRate = s.stage1Overrides.unconditionedRate != null ? s.stage1Overrides.unconditionedRate : calcUncondRate;

    const calcCost = totals.conditionedSf * effCondRate + totals.unconditionedSf * effUncondRate;
    const effCost  = s.stage1Overrides.constructionCost != null ? s.stage1Overrides.constructionCost : calcCost;

    const stage1 = {
      baseline,
      multipliers: {
        structural: structuralMult1,
        size: sizeMult,
        conditionedDensity: condDensityMult,
        unconditionedDensity: uncondDensityMult,
        regional: regionalMult,
      },
      densities: { conditioned: condDensity, unconditioned: uncondDensity },
      totals,
      calcCondRate, calcUncondRate,
      effCondRate, effUncondRate,
      calcCost, effCost,
    };

    // Stage 2
    const feePct = window.aeConfig.feePercent(effCost, cfg.feeSchedule, s.program.buildingCategory, s.program.projectComplexity);
    const totalFeeBase = effCost * feePct;

    const structuralMult2 = cfg.structuralMultipliers.stage2[s.program.structuralComplexity] || 1.0;
    const totalStructuralFee = effCost * cfg.structuralSettings.share * cfg.structuralSettings.totalRate * structuralMult2;
    const structuralEngineeringDollars = totalStructuralFee * cfg.structuralSettings.designPortion;
    const structuralCaDollars          = totalStructuralFee * cfg.structuralSettings.caPortion;

    // The fee schedule is architect-only; the table value IS the architect's
    // base fee. Structural is a separate scope that sits in its own section
    // and adds to the grand total — not subtracted here.
    const architectShare = totalFeeBase;

    const pw = cfg.phaseWeights;
    const feasibilityConceptDollars = architectShare * pw.feasibilityConcept;
    const schematicDollars          = architectShare * pw.schematicDesign;
    const designDevelopmentBase     = architectShare * pw.designDevelopment;
    const cdTotalDollars            = architectShare * pw.constructionDocuments;
    const biddingDollars            = architectShare * pw.biddingNegotiation;
    const designCaDollars           = architectShare * pw.constructionAdministration;

    // Design Development scales with which CD sub-levels are included.
    // Excluding Construction Set / Bid Set / Permit Set zeroes out their share
    // of the DD baseline (overrides on DD still win as usual).
    const exc = s.lineExclusions || {};
    const ddSplit = cfg.designDevelopmentCdSplit || { permitSet: 0.25, bidSet: 0.25, constructionSet: 0.50 };
    const ddWeight =
        (exc['permit_set']       ? 0 : (ddSplit.permitSet       || 0))
      + (exc['bid_set']          ? 0 : (ddSplit.bidSet          || 0))
      + (exc['construction_set'] ? 0 : (ddSplit.constructionSet || 0));
    const designDevelopmentDollars = designDevelopmentBase * ddWeight;

    // Construction Administration scales with which CD sub-levels are
    // included. Default split (0 / 0.5 / 0.5): excluding Construction Set
    // halves CA; also excluding Bid Set zeros CA. Applies to both Design CA
    // and Structural CA.
    const caSplit = cfg.constructionAdministrationCdSplit || { permitSet: 0.0, bidSet: 0.5, constructionSet: 0.5 };
    const caWeight =
        (exc['permit_set']       ? 0 : (caSplit.permitSet       || 0))
      + (exc['bid_set']          ? 0 : (caSplit.bidSet          || 0))
      + (exc['construction_set'] ? 0 : (caSplit.constructionSet || 0));
    const designCaDollarsAdjusted    = designCaDollars         * caWeight;
    const structuralCaDollarsAdjusted = structuralCaDollars    * caWeight;

    // CD sub-level dollar splits — all three compute their full value.
    // Exclusion is now per-line via state.lineExclusions.
    let permitSetDollars       = cdTotalDollars * cfg.cdSubLevelSplit.permitSet;
    const bidSetDollars        = cdTotalDollars * cfg.cdSubLevelSplit.bidSet;
    const constructionSetDollars = cdTotalDollars * cfg.cdSubLevelSplit.constructionSet;

    // Permit set sizing: base factor (default 0.8) plus sum of active flag adders.
    // No flags → 0.8× the CD-split allocation. Each active flag adds work on top.
    const activeFlags = cfg.regulatoryFlags.filter((f) => (s.stage2.activeFlags || []).includes(f.id));
    const permitSetAdderSum = activeFlags.reduce((sum, f) => sum + (f.permitSetAdder || 0), 0);
    const permitSetBaseFactor = (cfg.permitSetBaseFactor != null) ? cfg.permitSetBaseFactor : 0.8;
    const permitSetUpliftFactor = permitSetBaseFactor + permitSetAdderSum;
    permitSetDollars = permitSetDollars * permitSetUpliftFactor;

    // City Comment Revisions: a percentage of the (post-flag) permit set value.
    const cityCommentsPctOfPermitSet = (cfg.cityCommentsPctOfPermitSet != null) ? cfg.cityCommentsPctOfPermitSet : 0.25;
    const cityCommentsDollars = permitSetDollars * cityCommentsPctOfPermitSet;

    const schedule = cfg.feeSchedule;
    const bracketIdx = window.aeConfig.feeBracketIndex(effCost, schedule);
    const bracketLabel = schedule.brackets[bracketIdx] ? schedule.brackets[bracketIdx].label : '';
    const categoryKey = String(s.program.buildingCategory || '7');
    const category = schedule.categories[categoryKey] || schedule.categories['7'];
    const basePct = (category && category.pcts) ? category.pcts[bracketIdx] : 0;
    const complexityFactor = (schedule.projectComplexityFactors || {})[s.program.projectComplexity] || 1.0;
    const scheduleFactor = schedule.factor != null ? schedule.factor : 1.0;

    const stage2 = {
      feePct,
      totalFeeBase,
      totalStructuralFee,
      architectShare,
      permitSetUpliftFactor,
      cityCommentsPctOfPermitSet,
      schedule: {
        categoryKey,
        categoryLabel: category ? category.shortLabel : '',
        bracketIdx,
        bracketLabel,
        basePct,
        complexityKey: s.program.projectComplexity,
        complexityFactor,
        scheduleFactor,
      },
    };

    // Calculated dollars per line (for calculated lines). For manual lines, calculated hours = manualHours[lineId].
    const calculatedDollarsByLine = {
      feasibility_concept: feasibilityConceptDollars,
      schematic_design: schematicDollars,
      design_development: designDevelopmentDollars,
      permit_set: permitSetDollars,
      bid_set: bidSetDollars,
      construction_set: constructionSetDollars,
      structural_engineering: structuralEngineeringDollars,
      bidding_negotiation: biddingDollars,
      city_comment_revisions: cityCommentsDollars,
      design_ca: designCaDollarsAdjusted,
      structural_ca: structuralCaDollarsAdjusted,
    };

    // Build sections
    const sections = SECTIONS.map((sect) => {
      const lines = [];
      sect.lineIds.forEach((lineId) => {
        const rate = cfg.hourlyRates[lineId] || 0;
        const override = s.lineOverrides[lineId] || {};
        const isManual = MANUAL_LINES.has(lineId);

        let calcHours, calcDollars;
        if (isManual) {
          calcHours = s.manualHours[lineId] || 0;
          calcDollars = calcHours * rate;
        } else {
          calcDollars = calculatedDollarsByLine[lineId] || 0;
          calcHours = rate > 0 ? calcDollars / rate : 0;
        }

        let effHours, effDollars, overriddenField = null;
        if (override.dollars != null) {
          effDollars = override.dollars;
          effHours = rate > 0 ? effDollars / rate : 0;
          overriddenField = 'dollars';
        } else if (override.hours != null) {
          effHours = override.hours;
          effDollars = effHours * rate;
          overriddenField = 'hours';
        } else {
          effHours = calcHours;
          effDollars = calcDollars;
        }

        const excluded = !!(s.lineExclusions || {})[lineId];
        lines.push({
          id: lineId,
          label: LINE_LABELS[lineId] || lineId,
          rate,
          calcHours, calcDollars,
          effHours, effDollars,
          isManual,
          isCalculated: !isManual,
          overriddenField,
          isOverridden: overriddenField !== null,
          excluded,
        });
      });

      // Additional Services section: user-managed lines
      if (sect.id === 'additional-services') {
        (s.additionalServices || []).forEach((item) => {
          const rate = item.rate || 0;
          const hours = item.hours || 0;
          const dollars = item.dollars != null ? item.dollars : hours * rate;
          const excluded = !!(s.lineExclusions || {})[item.id];
          lines.push({
            id: item.id,
            label: item.label || '',
            rate,
            calcHours: hours,
            calcDollars: dollars,
            effHours: hours,
            effDollars: dollars,
            isManual: true,
            isCalculated: false,
            isUser: true,
            overriddenField: null,
            isOverridden: false,
            excluded,
          });
        });
      }

      const totalHours = lines.reduce((sum, l) => sum + (l.excluded ? 0 : (l.effHours || 0)), 0);
      const totalDollars = lines.reduce((sum, l) => sum + (l.excluded ? 0 : (l.effDollars || 0)), 0);
      const blendedRate = totalHours > 0 ? totalDollars / totalHours : 0;

      return {
        id: sect.id,
        label: sect.label,
        lines,
        totalHours,
        totalDollars,
        blendedRate,
      };
    });

    const grandTotalHours = sections.reduce((sum, s) => sum + s.totalHours, 0);
    const grandTotalDollars = sections.reduce((sum, s) => sum + s.totalDollars, 0);

    return {
      stage1,
      stage2,
      sections,
      grandTotal: { hours: grandTotalHours, dollars: grandTotalDollars },
    };
  }

  // ---------- Formatting ----------

  function fmtHours(n) {
    if (!isFinite(n)) return '0';
    return (Math.round(n * 10) / 10).toFixed(1);
  }

  function fmtMoney(n) {
    if (!isFinite(n)) n = 0;
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function fmtRate(n) {
    if (!isFinite(n)) n = 0;
    return '$' + Math.round(n).toLocaleString('en-US') + '/hr';
  }

  function fmtPct(n) {
    if (!isFinite(n)) n = 0;
    return (n * 100).toFixed(2) + '%';
  }

  function fmtMult(n) {
    if (!isFinite(n)) n = 1;
    return '×' + n.toFixed(3);
  }

  // ---------- Rendering ----------

  function render() {
    const cfg = ensureConfig();
    const result = calculate(state, cfg);

    app.innerHTML = `
      <div class="estimate-form ae-form">
        <div class="form-header">
          <h2>A/E Estimate</h2>
          <div class="ae-form-header-buttons">
            <button class="btn btn-secondary" id="aeBtnSettings">Settings</button>
            <button class="btn btn-secondary" id="aeBtnImport">Import</button>
            <button class="btn btn-secondary" id="aeBtnSaveDefault">Save as Default</button>
            <button class="btn btn-secondary" id="aeBtnResetDefault">Reset to Defaults</button>
            <button class="btn btn-secondary" id="aeBtnNewProject">New Project</button>
          </div>
        </div>

        ${renderIdentitySection()}
        ${renderProgramItemsSection()}
        ${renderProgramSection()}
        ${renderStage1Section(cfg, result)}
        ${renderStage2Section(cfg, result)}
        ${renderOutput(result)}

        <div class="form-actions">
          <button class="btn btn-primary" id="aeBtnExport">Export Estimate</button>
          <button class="btn btn-primary" id="aeBtnProposal">Generate Proposal</button>
        </div>
      </div>
    `;

    bindEvents();
  }

  function renderIdentitySection() {
    const i = state.identity;
    return `
      <div class="form-section">
        <h3>Project</h3>
        <div class="form-row">
          <div class="form-group" style="flex:1">
            <label for="aeProjectAddress">Project Address</label>
            <input type="text" id="aeProjectAddress" value="${escapeAttr(i.projectAddress)}" placeholder="e.g. 1234 Main St, Austin, TX">
          </div>
          <div class="form-group" style="flex:1">
            <label for="aeClientName">Client</label>
            <input type="text" id="aeClientName" value="${escapeAttr(i.clientName)}" placeholder="Client name">
          </div>
        </div>
      </div>
    `;
  }

  function renderProgramItemsSection() {
    const items = state.programItems || [];
    return `
      <div class="form-section">
        <h3>Program</h3>
        <p class="help-text">Narrative list of what the project includes (e.g., "Enlarge master bathroom", "New ADU above garage"). Organizational only — not used in the calculation.</p>
        <div class="ae-program-items">
          ${items.map((it) => `
            <div class="ae-program-item" data-item-id="${it.id}">
              <input type="text" class="ae-program-item-text" data-item-id="${it.id}" value="${escapeAttr(it.text || '')}" placeholder="e.g., Enlarge master bathroom">
              <button class="ae-program-item-remove" data-item-id="${it.id}" title="Remove">×</button>
            </div>
          `).join('')}
        </div>
        <div class="ae-add-row"><button class="btn btn-small" id="aeAddProgramItemBtn">+ Add Item</button></div>
      </div>
    `;
  }

  function renderProgramSection() {
    const p = state.program;
    const cfg = ensureConfig();
    const scopes = p.scopes || [];
    const totals = sumScopes(scopes);
    const canRemove = scopes.length > 1;

    return `
      <div class="form-section">
        <h3>Areas in Scope</h3>
        <div class="ae-scopes">
          <div class="ae-scope-row ae-scope-header">
            <span>Area</span>
            <span>Type</span>
            <span>Cond sf</span>
            <span>Cond spaces</span>
            <span>Uncond sf</span>
            <span>Uncond spaces</span>
            <span></span>
          </div>
          ${scopes.map((sc) => `
            <div class="ae-scope-row" data-scope-id="${sc.id}">
              <input type="text"   class="ae-scope-name"  data-scope-id="${sc.id}" value="${escapeAttr(sc.name)}" placeholder="Area name">
              <div class="ae-scope-type-toggle">
                ${SCOPE_TYPES.map((t) => `<button type="button" class="ae-scope-type-btn ${sc.type === t ? 'active' : ''}" data-scope-id="${sc.id}" data-scope-type="${t}">${SCOPE_TYPE_LABELS[t]}</button>`).join('')}
              </div>
              <input type="number" class="ae-scope-csf"   data-scope-id="${sc.id}" min="0" step="50" value="${sc.conditionedSf || 0}">
              <input type="number" class="ae-scope-csp"   data-scope-id="${sc.id}" min="0" step="1"  value="${sc.conditionedSpaces || 0}">
              <input type="number" class="ae-scope-usf"   data-scope-id="${sc.id}" min="0" step="50" value="${sc.unconditionedSf || 0}">
              <input type="number" class="ae-scope-usp"   data-scope-id="${sc.id}" min="0" step="1"  value="${sc.unconditionedSpaces || 0}">
              ${canRemove ? `<button class="ae-scope-remove" data-scope-id="${sc.id}" title="Remove area">×</button>` : '<span></span>'}
            </div>
          `).join('')}
          <div class="ae-scope-row ae-scope-totals">
            <span>Total (${scopes.length} area${scopes.length === 1 ? '' : 's'})</span>
            <span></span>
            <span>${totals.conditionedSf.toLocaleString()}</span>
            <span>${totals.conditionedSpaces}</span>
            <span>${totals.unconditionedSf.toLocaleString()}</span>
            <span>${totals.unconditionedSpaces}</span>
            <span></span>
          </div>
          <div class="ae-add-row"><button class="btn btn-small" id="aeAddScopeBtn">+ Add Area</button></div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="aeBuildGrade">Build Grade</label>
            <select id="aeBuildGrade">
              ${(() => {
                const grades = window.aeConfig.deriveBuildGrades(cfg.builderBaseConditionedSf);
                const labels = window.aeConfig.BUILD_GRADE_LABELS;
                return window.aeConfig.BUILD_GRADE_KEYS.map((g) => {
                  const r = grades[g];
                  return `<option value="${g}" ${p.buildGrade === g ? 'selected' : ''}>${labels[g] || g} ($${Math.round(r.conditioned)}/$${Math.round(r.unconditioned)} per sf)</option>`;
                }).join('');
              })()}
            </select>
          </div>
          <div class="form-group">
            <label for="aeStructuralComplexity">Structural Complexity</label>
            <select id="aeStructuralComplexity">
              ${['low', 'medium', 'high'].map((c) => {
                const m1 = (cfg.structuralMultipliers.stage1 || {})[c];
                const m2 = (cfg.structuralMultipliers.stage2 || {})[c];
                return `<option value="${c}" ${p.structuralComplexity === c ? 'selected' : ''}>${cfg.structuralComplexityLabels[c] || c} (cost ×${m1.toFixed(2)} · fee ×${m2.toFixed(2)})</option>`;
              }).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="aeBuildingCategory">Building Category</label>
            <select id="aeBuildingCategory">
              ${Object.keys(cfg.feeSchedule.categories).map((k) => `<option value="${k}" ${String(p.buildingCategory) === k ? 'selected' : ''}>${cfg.feeSchedule.categories[k].shortLabel}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="aeProjectComplexity">Project Complexity</label>
            <select id="aeProjectComplexity">
              ${Object.keys(cfg.feeSchedule.projectComplexityFactors).map((c) => `<option value="${c}" ${p.projectComplexity === c ? 'selected' : ''}>${cfg.feeSchedule.projectComplexityLabels[c] || c} (×${cfg.feeSchedule.projectComplexityFactors[c]})</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="aeRegionalMultiplier">Regional Multiplier <span class="ae-calc-hint">city/region cost adjustment vs national average (1.00 = US avg)</span></label>
            <input type="number" id="aeRegionalMultiplier" min="0" step="0.05" value="${(p.regionalMultiplier != null ? p.regionalMultiplier : 1.00)}">
          </div>
        </div>
        <p class="help-text">Break the project into areas (e.g., "Existing house", "Addition", "ADU"). Totals roll into the calculation; area names and type are organizational only. <strong>Cond spaces</strong>: named rooms inside the thermal envelope. <strong>Uncond spaces</strong>: garages, porches, covered outdoor areas.</p>
      </div>
    `;
  }

  function renderStage1Section(cfg, result) {
    const s1 = result.stage1;
    const ov = state.stage1Overrides;
    return `
      <div class="form-section">
        <h3>Stage 1 · Construction Cost</h3>
        <div class="ae-multiplier-strip">
          <div class="ae-multiplier-chip"><span class="ae-chip-label">Structural</span><span class="ae-chip-value">${fmtMult(s1.multipliers.structural)}</span></div>
          <div class="ae-multiplier-chip"><span class="ae-chip-label">Size</span><span class="ae-chip-value">${fmtMult(s1.multipliers.size)}</span></div>
          <div class="ae-multiplier-chip"><span class="ae-chip-label">Cond Density</span><span class="ae-chip-value">${fmtMult(s1.multipliers.conditionedDensity)}</span></div>
          <div class="ae-multiplier-chip"><span class="ae-chip-label">Uncond Density</span><span class="ae-chip-value">${fmtMult(s1.multipliers.unconditionedDensity)}</span></div>
          <div class="ae-multiplier-chip"><span class="ae-chip-label">Regional</span><span class="ae-chip-value">${fmtMult(s1.multipliers.regional)}</span></div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="aeCondRateOverride">Conditioned $/sf <span class="ae-calc-hint">calc ${fmtMoney(s1.calcCondRate)}</span></label>
            <input type="number" id="aeCondRateOverride" step="1" value="${ov.conditionedRate != null ? ov.conditionedRate : ''}" placeholder="${Math.round(s1.calcCondRate)}">
          </div>
          <div class="form-group">
            <label for="aeUncondRateOverride">Unconditioned $/sf <span class="ae-calc-hint">calc ${fmtMoney(s1.calcUncondRate)}</span></label>
            <input type="number" id="aeUncondRateOverride" step="1" value="${ov.unconditionedRate != null ? ov.unconditionedRate : ''}" placeholder="${Math.round(s1.calcUncondRate)}">
          </div>
          <div class="form-group">
            <label for="aeCostOverride">Construction Cost <span class="ae-calc-hint">calc ${fmtMoney(s1.calcCost)}</span></label>
            <input type="number" id="aeCostOverride" step="1000" value="${ov.constructionCost != null ? ov.constructionCost : ''}" placeholder="${Math.round(s1.calcCost)}">
          </div>
        </div>
        <div class="ae-calc-strip">
          <div class="ae-calc-formula-line">
            <span class="ae-calc-line-label">Conditioned $/sf:</span>
            $${s1.baseline.conditioned.toFixed(2)} baseline × ${s1.multipliers.structural.toFixed(3)} structural × ${s1.multipliers.size.toFixed(3)} size × ${s1.multipliers.conditionedDensity.toFixed(3)} density × ${s1.multipliers.regional.toFixed(3)} regional = <strong>$${s1.calcCondRate.toFixed(2)}</strong>
          </div>
          <div class="ae-calc-formula-line">
            <span class="ae-calc-line-label">Unconditioned $/sf:</span>
            $${s1.baseline.unconditioned.toFixed(2)} baseline × ${s1.multipliers.structural.toFixed(3)} structural × ${s1.multipliers.size.toFixed(3)} size × ${s1.multipliers.unconditionedDensity.toFixed(3)} density × ${s1.multipliers.regional.toFixed(3)} regional = <strong>$${s1.calcUncondRate.toFixed(2)}</strong>
          </div>
          <div class="ae-calc-formula-line">
            <span class="ae-calc-line-label">Construction cost:</span>
            ${s1.totals.conditionedSf.toLocaleString()} cond sf × $${s1.effCondRate.toFixed(2)} + ${s1.totals.unconditionedSf.toLocaleString()} uncond sf × $${s1.effUncondRate.toFixed(2)}
          </div>
          <div class="ae-calc-result">
            <span class="ae-calc-label">Construction Cost</span>
            <span class="ae-calc-value">${fmtMoney(s1.effCost)}</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderStage2Section(cfg, result) {
    const sch = result.stage2.schedule;
    const s2 = result.stage2;
    return `
      <div class="form-section">
        <h3>Stage 2 · Scope &amp; Regulatory</h3>
        <div class="form-row">
          <div class="form-group">
            <label for="aeScheduleFactor">Fee Schedule Factor <span class="ae-calc-hint">multiplies the whole table for calibration</span></label>
            <input type="number" id="aeScheduleFactor" step="0.05" min="0" value="${(cfg.feeSchedule.factor != null ? cfg.feeSchedule.factor : 1).toString()}">
          </div>
        </div>
        <div class="ae-fee-breakdown">
          <span>Cat ${sch.categoryKey} · ${escapeHtml(sch.bracketLabel)}</span>
          <span>base ${(sch.basePct * 100).toFixed(2)}%</span>
          <span>× complexity ${sch.complexityFactor.toFixed(2)}</span>
          <span>× factor ${sch.scheduleFactor.toFixed(2)}</span>
          <span class="ae-fee-breakdown-final">= ${(s2.feePct * 100).toFixed(2)}%</span>
        </div>
        <div class="ae-calc-strip">
          <div class="ae-calc-formula">
            ${fmtMoney(result.stage1.effCost)} × ${(s2.feePct * 100).toFixed(2)}%
            <span class="ae-calc-hint">(structural fees compute separately — see Structural Engineering section)</span>
          </div>
          <div class="ae-calc-result">
            <span class="ae-calc-label">Base Architect Fee</span>
            <span class="ae-calc-value">${fmtMoney(s2.architectShare)}</span>
          </div>
        </div>
        <div class="ae-flags-grid">
          ${cfg.regulatoryFlags.map((f) => {
            const checked = (state.stage2.activeFlags || []).includes(f.id) ? 'checked' : '';
            return `<label class="ae-flag-checkbox">
              <input type="checkbox" data-flag-id="${f.id}" ${checked}>
              <span>${escapeHtml(f.label)}</span>
            </label>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderOutput(result) {
    const { sections, grandTotal, stage1 } = result;
    const actualFeePct = stage1.effCost > 0 ? grandTotal.dollars / stage1.effCost : 0;
    return `
      <div class="ae-output">
        ${sections.map((sect) => renderSection(sect)).join('')}
        <div class="ae-grand-total">
          <div class="ae-grand-total-item"><span class="ae-gt-label">Total Hours</span><span class="ae-gt-value">${fmtHours(grandTotal.hours)}</span></div>
          <div class="ae-grand-total-item"><span class="ae-gt-label">Total Fee</span><span class="ae-gt-value">${fmtMoney(grandTotal.dollars)}</span></div>
          <div class="ae-grand-total-item"><span class="ae-gt-label">Effective Fee %</span><span class="ae-gt-value">${fmtPct(actualFeePct)}</span></div>
        </div>
      </div>
    `;
  }

  function renderSection(sect) {
    const isCollapsed = collapsedSections.has(sect.id);
    const caret = isCollapsed ? '▸' : '▾';
    const isAdditional = sect.id === 'additional-services';

    return `
      <div class="ae-section ${isCollapsed ? 'collapsed' : ''}" data-section-id="${sect.id}">
        <div class="ae-section-header" data-toggle-section="${sect.id}">
          <span class="ae-section-caret">${caret}</span>
          <span class="ae-section-label">${sect.label}</span>
          <span class="ae-section-totals">
            <span>${fmtHours(sect.totalHours)} hrs</span>
            <span>·</span>
            <span>${fmtMoney(sect.totalDollars)}</span>
            <span>·</span>
            <span>${sect.totalHours > 0 ? fmtRate(sect.blendedRate) : '—'}</span>
          </span>
        </div>
        <div class="ae-section-body">
          <div class="ae-line-row ae-line-header">
            <span class="ae-line-include" title="Include">✓</span>
            <span class="ae-line-label">Line</span>
            <span class="ae-line-rate">Rate</span>
            <span class="ae-line-hours">Hours</span>
            <span class="ae-line-dollars">Dollars</span>
            <span class="ae-line-controls"></span>
          </div>
          ${sect.lines.map((l) => renderLine(l)).join('')}
          ${isAdditional ? `<div class="ae-add-row"><button class="btn btn-small" id="aeAddServiceBtn">+ Add Line</button></div>` : ''}
        </div>
      </div>
    `;
  }

  function renderLine(l) {
    const overrideBadge = l.isOverridden
      ? `<span class="ae-override-badge" title="Overridden ${l.overriddenField}">edited</span>`
      : '';
    const excludedBadge = l.excluded
      ? `<span class="ae-excluded-badge" title="Not included in totals">not included</span>`
      : '';
    const ghostCalc = l.isOverridden
      ? `<span class="ae-ghost-calc" title="Calculated value">(${fmtHours(l.calcHours)}h · ${fmtMoney(l.calcDollars)})</span>`
      : '';
    const resetBtn = l.isOverridden
      ? `<button class="ae-line-reset" data-reset-line="${l.id}" title="Reset to calculated">↺</button>`
      : '';
    const labelCell = l.isUser
      ? `<input type="text" class="ae-user-label" data-svc-id="${l.id}" value="${escapeAttr(l.label)}" placeholder="Service description">`
      : `<span>${escapeHtml(l.label)} ${overrideBadge} ${excludedBadge}</span>`;
    const userBadge = l.isUser ? excludedBadge : '';
    const rateCell = l.isUser
      ? `<input type="number" class="ae-user-rate" data-svc-id="${l.id}" min="0" step="1" value="${l.rate || 0}">`
      : `<span class="ae-rate-display">${fmtRate(l.rate)}</span>`;
    const removeBtn = l.isUser
      ? `<button class="ae-line-remove" data-remove-svc="${l.id}" title="Remove line">×</button>`
      : '';

    const hoursCell = l.isUser
      ? `<input type="number" class="ae-line-input ae-user-hours" data-svc-id="${l.id}" min="0" step="0.5" value="${fmtHours(l.effHours)}">`
      : `<input type="number" class="ae-line-input ae-line-hours-input ${l.isOverridden && l.overriddenField === 'hours' ? 'overridden' : ''}" data-line-id="${l.id}" min="0" step="0.5" value="${fmtHours(l.effHours)}">`;
    const dollarsCell = l.isUser
      ? `<input type="number" class="ae-line-input ae-user-dollars" data-svc-id="${l.id}" min="0" step="1" value="${Math.round(l.effDollars)}">`
      : `<input type="number" class="ae-line-input ae-line-dollars-input ${l.isOverridden && l.overriddenField === 'dollars' ? 'overridden' : ''}" data-line-id="${l.id}" min="0" step="1" value="${Math.round(l.effDollars)}">`;

    const includeToggle = `<input type="checkbox" class="ae-include-checkbox" data-line-id="${l.id}" ${!l.excluded ? 'checked' : ''} title="Include in totals">`;

    return `
      <div class="ae-line-row ${l.isOverridden ? 'is-overridden' : ''} ${l.excluded ? 'is-excluded' : ''}">
        <span class="ae-line-include">${includeToggle}</span>
        <span class="ae-line-label">${labelCell}${l.isUser ? ' ' + userBadge : ''}</span>
        <span class="ae-line-rate">${rateCell}</span>
        <span class="ae-line-hours">${hoursCell}</span>
        <span class="ae-line-dollars">${dollarsCell}</span>
        <span class="ae-line-controls">${ghostCalc} ${resetBtn} ${removeBtn}</span>
      </div>
    `;
  }

  // ---------- Event binding ----------

  function bindEvents() {
    // Identity
    attachText('aeProjectAddress', (v) => { state.identity.projectAddress = v; }, false);
    attachText('aeClientName',     (v) => { state.identity.clientName = v; }, false);

    // Program items (narrative list)
    document.querySelectorAll('.ae-program-item-text').forEach((el) => {
      el.addEventListener('change', () => {
        const item = (state.programItems || []).find((x) => x.id === el.dataset.itemId);
        if (item) item.text = el.value;
      });
    });
    document.querySelectorAll('.ae-program-item-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.programItems = (state.programItems || []).filter((x) => x.id !== btn.dataset.itemId);
        render();
      });
    });
    const addItemBtn = document.getElementById('aeAddProgramItemBtn');
    if (addItemBtn) {
      addItemBtn.addEventListener('click', () => {
        (state.programItems = state.programItems || []).push({ id: 'item_' + Math.random().toString(36).slice(2, 10), text: '' });
        render();
      });
    }

    // Program — scopes
    document.querySelectorAll('.ae-scope-name').forEach((el) => {
      el.addEventListener('change', () => {
        const sc = findScope(el.dataset.scopeId);
        if (sc) { sc.name = el.value; render(); }
      });
    });
    document.querySelectorAll('.ae-scope-type-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sc = findScope(btn.dataset.scopeId);
        if (!sc) return;
        sc.type = btn.dataset.scopeType;
        render();
      });
    });
    document.querySelectorAll('.ae-scope-csf').forEach((el) => bindScopeNumber(el, 'conditionedSf'));
    document.querySelectorAll('.ae-scope-csp').forEach((el) => bindScopeNumber(el, 'conditionedSpaces'));
    document.querySelectorAll('.ae-scope-usf').forEach((el) => bindScopeNumber(el, 'unconditionedSf'));
    document.querySelectorAll('.ae-scope-usp').forEach((el) => bindScopeNumber(el, 'unconditionedSpaces'));
    document.querySelectorAll('.ae-scope-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (state.program.scopes.length <= 1) return;
        state.program.scopes = state.program.scopes.filter((s) => s.id !== btn.dataset.scopeId);
        render();
      });
    });
    const addScopeBtn = document.getElementById('aeAddScopeBtn');
    if (addScopeBtn) {
      addScopeBtn.addEventListener('click', () => {
        const n = state.program.scopes.length + 1;
        state.program.scopes.push(makeScope('Area ' + n, 0, 0, 0, 0));
        render();
      });
    }

    attachSelect('aeBuildGrade',   (v) => { state.program.buildGrade = v; render(); });
    attachSelect('aeStructuralComplexity', (v) => { state.program.structuralComplexity = v; render(); });
    attachSelect('aeBuildingCategory', (v) => { state.program.buildingCategory = v; render(); });
    attachSelect('aeProjectComplexity', (v) => { state.program.projectComplexity = v; render(); });
    attachNumber('aeRegionalMultiplier', (v) => { state.program.regionalMultiplier = v > 0 ? v : 1.0; render(); });

    // Stage 1 overrides (empty string clears the override)
    attachNumberOrClear('aeCondRateOverride',   (v) => { state.stage1Overrides.conditionedRate = v; render(); });
    attachNumberOrClear('aeUncondRateOverride', (v) => { state.stage1Overrides.unconditionedRate = v; render(); });
    attachNumberOrClear('aeCostOverride',       (v) => { state.stage1Overrides.constructionCost = v; render(); });

    // Stage 2
    // Per-line include/exclude toggles
    document.querySelectorAll('.ae-include-checkbox').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.lineId;
        if (cb.checked) delete state.lineExclusions[id];
        else state.lineExclusions[id] = true;
        render();
      });
    });

    // Fee schedule factor lives in state.config (per-project). Use Settings →
    // "Save as Default" to persist to localStorage.
    const factorEl = document.getElementById('aeScheduleFactor');
    if (factorEl) {
      factorEl.addEventListener('change', () => {
        const raw = parseFloat(factorEl.value);
        const v = isFinite(raw) && raw >= 0 ? raw : 1.0;
        ensureConfig();
        state.config.feeSchedule.factor = v;
        render();
      });
    }

    document.querySelectorAll('[data-flag-id]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.flagId;
        const active = new Set(state.stage2.activeFlags || []);
        if (cb.checked) active.add(id); else active.delete(id);
        state.stage2.activeFlags = Array.from(active);
        render();
      });
    });

    // Section collapse/expand
    document.querySelectorAll('[data-toggle-section]').forEach((el) => {
      el.addEventListener('click', (e) => {
        // Ignore clicks that originated on interactive children inside the header.
        if (e.target.closest('input, button, select')) return;
        const id = el.dataset.toggleSection;
        if (collapsedSections.has(id)) collapsedSections.delete(id);
        else collapsedSections.add(id);
        render();
      });
    });

    // Calculated-line edits: hours
    document.querySelectorAll('.ae-line-hours-input').forEach((el) => {
      el.addEventListener('change', () => {
        const lineId = el.dataset.lineId;
        const v = parseFloat(el.value);
        if (MANUAL_LINES.has(lineId)) {
          // Editing hours on a manual line updates manualHours (not an override).
          state.manualHours[lineId] = isFinite(v) ? v : 0;
          delete state.lineOverrides[lineId];
        } else {
          if (!isFinite(v)) { delete state.lineOverrides[lineId]; }
          else { state.lineOverrides[lineId] = { hours: v }; }
        }
        render();
      });
    });

    // Calculated-line edits: dollars
    document.querySelectorAll('.ae-line-dollars-input').forEach((el) => {
      el.addEventListener('change', () => {
        const lineId = el.dataset.lineId;
        const v = parseFloat(el.value);
        if (!isFinite(v)) { delete state.lineOverrides[lineId]; }
        else { state.lineOverrides[lineId] = { dollars: v }; }
        render();
      });
    });

    // Reset-to-calculated
    document.querySelectorAll('[data-reset-line]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.resetLine;
        delete state.lineOverrides[id];
        render();
      });
    });

    // Additional Services: add line
    const addBtn = document.getElementById('aeAddServiceBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const cfg = ensureConfig();
        state.additionalServices.push({
          id: 'svc_' + Math.random().toString(36).slice(2, 10),
          label: '',
          rate: cfg.hourlyRates.additional_services_default || 142,
          hours: 0,
          dollars: 0,
        });
        render();
      });
    }

    // Additional Services: edit fields
    document.querySelectorAll('.ae-user-label').forEach((el) => {
      el.addEventListener('change', () => {
        const svc = findSvc(el.dataset.svcId);
        if (svc) { svc.label = el.value; render(); }
      });
    });
    document.querySelectorAll('.ae-user-rate').forEach((el) => {
      el.addEventListener('change', () => {
        const svc = findSvc(el.dataset.svcId);
        if (!svc) return;
        const r = parseFloat(el.value);
        svc.rate = isFinite(r) ? r : 0;
        svc.dollars = (svc.hours || 0) * svc.rate;
        render();
      });
    });
    document.querySelectorAll('.ae-user-hours').forEach((el) => {
      el.addEventListener('change', () => {
        const svc = findSvc(el.dataset.svcId);
        if (!svc) return;
        const h = parseFloat(el.value);
        svc.hours = isFinite(h) ? h : 0;
        svc.dollars = svc.hours * (svc.rate || 0);
        render();
      });
    });
    document.querySelectorAll('.ae-user-dollars').forEach((el) => {
      el.addEventListener('change', () => {
        const svc = findSvc(el.dataset.svcId);
        if (!svc) return;
        const d = parseFloat(el.value);
        svc.dollars = isFinite(d) ? d : 0;
        svc.hours = (svc.rate || 0) > 0 ? svc.dollars / svc.rate : 0;
        render();
      });
    });
    document.querySelectorAll('[data-remove-svc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.additionalServices = state.additionalServices.filter((s) => s.id !== btn.dataset.removeSvc);
        render();
      });
    });

    // Top-level buttons
    document.getElementById('aeBtnExport').addEventListener('click', () => { exportProject(); });
    document.getElementById('aeBtnImport').addEventListener('click', () => { importProject(); });
    const proposalBtn = document.getElementById('aeBtnProposal');
    if (proposalBtn) proposalBtn.addEventListener('click', () => { openProposalModal(); });
    const settingsBtn = document.getElementById('aeBtnSettings');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        if (!window.aeSettings) { alert('Settings module not loaded.'); return; }
        ensureConfig();
        window.aeSettings.open(state.config, (newConfig, alsoSaveAsDefault) => {
          state.config = newConfig;
          if (alsoSaveAsDefault) {
            window.aeConfig.saveConfig(newConfig);
          }
          render();
        });
      });
    }
    document.getElementById('aeBtnSaveDefault').addEventListener('click', () => {
      window.aeConfig.saveProgramDefaults(extractProgramDefaults(state));
      flashHeaderButton('aeBtnSaveDefault', 'Saved as default');
    });
    document.getElementById('aeBtnResetDefault').addEventListener('click', () => {
      if (!confirm('Restore Build Grade, Structural Complexity, Building Category, Project Complexity, Regional Multiplier, Areas, and line Include toggles to your saved defaults? Client name, line dollar edits, manual hours, and additional services are kept.')) return;
      applyDefaultsToState(loadEffectiveProgramDefaults());
      render();
    });
    document.getElementById('aeBtnNewProject').addEventListener('click', () => {
      if (!confirm('Start a new project? Project name, line edits, manual hours, additional services, and other per-project work will be cleared.')) return;
      const preservedConfig = state.config;
      state = makeInitialState();
      state.config = preservedConfig;
      refreshExportSnapshot();
      render();
    });
  }

  function flashHeaderButton(id, label) {
    const btn = document.getElementById(id);
    if (!btn) return;
    const original = btn.textContent;
    btn.textContent = label;
    btn.classList.add('ae-btn-flash');
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('ae-btn-flash');
      btn.disabled = false;
    }, 900);
  }

  // ---------- Export / Import (per-tool, v3 envelope) ----------

  async function exportProject() {
    const name = state.identity.projectAddress || 'Untitled Project';
    const safeName = name.replace(/[^a-zA-Z0-9 _\-]/g, '');
    const wrapper = {
      version: 3,
      tool: 'ae',
      name,
      date: new Date().toISOString(),
      state,
    };
    const json = JSON.stringify(wrapper, null, 2);
    const blob = new Blob([json], { type: 'application/json' });

    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: safeName + ' - AE Estimate.json',
          types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        refreshExportSnapshot();
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName + ' - AE Estimate.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    refreshExportSnapshot();
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
            if (wrapper.tool && wrapper.tool !== 'ae') {
              alert('This is an SE estimate file. Open it on the SE Estimate page.');
              return;
            }
            imported = wrapper.state;
          } else if (wrapper && wrapper.version === 2) {
            imported = wrapper.aeState;
            if (!imported) { alert('No A/E estimate found in this file.'); return; }
          } else {
            alert('This file does not appear to be a valid A/E estimate.');
            return;
          }
          if (!imported || typeof imported !== 'object') {
            alert('This file does not appear to be a valid A/E estimate.');
            return;
          }
          window.aeEstimate.setState(imported);
        } catch (e) {
          alert('Could not read file: ' + e.message);
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  function findSvc(id) {
    return (state.additionalServices || []).find((s) => s.id === id);
  }

  function findScope(id) {
    return (state.program.scopes || []).find((s) => s.id === id);
  }

  function bindScopeNumber(el, field) {
    el.addEventListener('change', () => {
      const sc = findScope(el.dataset.scopeId);
      if (!sc) return;
      const v = parseFloat(el.value);
      sc[field] = isFinite(v) ? v : 0;
      render();
    });
  }

  function attachText(id, onChange, liveUpdate) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(liveUpdate ? 'input' : 'change', () => onChange(el.value));
  }

  function attachSelect(id, onChange) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => onChange(el.value));
  }

  function attachNumber(id, onChange) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      const v = parseFloat(el.value);
      onChange(isFinite(v) ? v : 0);
    });
  }

  function attachNumberOrClear(id, onChange) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      const raw = el.value.trim();
      if (raw === '') { onChange(null); return; }
      const v = parseFloat(raw);
      onChange(isFinite(v) ? v : null);
    });
  }

  // ---------- Utilities ----------

  function escapeAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---------- Public API ----------

  // ---------- Generate Proposal (copy-to-clipboard formatted for Google Docs) ----------
  //
  // Mirrors Chris's proposal template. Fills in dynamic fields from state;
  // keeps template narrative, assumptions, and T&Cs verbatim.

  function openProposalModal() {
    const existing = document.getElementById('aeProposalModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'aeProposalModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content modal-content-wide">
        <h2>Generate Proposal</h2>
        <p class="modal-subtitle">Fill in proposal-specific details, then preview and copy. Paste into Google Docs for a formatted proposal.</p>
        <div class="modal-form">
          <div class="form-row">
            <div class="form-group" style="flex:1">
              <label for="aePropProposedScope">Proposed scope (short phrase)</label>
              <input type="text" id="aePropProposedScope" placeholder="e.g. major remodel and second-story addition">
            </div>
          </div>
          <h3 style="margin-top:0.75rem;">Durations (weeks)</h3>
          <div class="form-row">
            <div class="form-group"><label for="aePropPdWks">Pre-Design</label><input type="number" id="aePropPdWks" min="0" step="1" value="2"></div>
            <div class="form-group"><label for="aePropSdWks">Schematic Design</label><input type="number" id="aePropSdWks" min="0" step="1" value="3"></div>
            <div class="form-group"><label for="aePropPermitWks">Permit Set</label><input type="number" id="aePropPermitWks" min="0" step="1" value="4"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label for="aePropSeWks">Structural</label><input type="number" id="aePropSeWks" min="0" step="1" value="2"></div>
            <div class="form-group"><label for="aePropBidWks">Bid Set</label><input type="number" id="aePropBidWks" min="0" step="1" value="2"></div>
            <div class="form-group"><label for="aePropCdWks">Construction Set</label><input type="number" id="aePropCdWks" min="0" step="1" value="3"></div>
          </div>
          <div class="form-row">
            <div class="form-group" style="flex:1">
              <label for="aePropRetainer">Retainer amount ($)</label>
              <input type="number" id="aePropRetainer" min="0" step="100" placeholder="e.g. 5000">
            </div>
            <div class="form-group" style="flex:1">
              <label for="aePropYourName">Your name / firm signature</label>
              <input type="text" id="aePropYourName" placeholder="e.g. Chris Okkem, Okkem Design">
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" id="aePropGenerate">Generate</button>
          <button class="btn btn-secondary" id="aePropCancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('aePropCancel').addEventListener('click', () => modal.remove());
    document.getElementById('aePropGenerate').addEventListener('click', () => {
      const inputs = {
        proposedScope:  document.getElementById('aePropProposedScope').value || '',
        pdWks:          parseInt(document.getElementById('aePropPdWks').value) || 0,
        sdWks:          parseInt(document.getElementById('aePropSdWks').value) || 0,
        permitWks:      parseInt(document.getElementById('aePropPermitWks').value) || 0,
        seWks:          parseInt(document.getElementById('aePropSeWks').value) || 0,
        bidWks:         parseInt(document.getElementById('aePropBidWks').value) || 0,
        cdWks:          parseInt(document.getElementById('aePropCdWks').value) || 0,
        retainer:       parseFloat(document.getElementById('aePropRetainer').value) || 0,
        yourName:       document.getElementById('aePropYourName').value || '',
      };
      modal.remove();
      showProposalPreview(inputs);
    });
  }

  function showProposalPreview(inputs) {
    const existing = document.getElementById('aeProposalPreviewModal');
    if (existing) existing.remove();

    const cfg = ensureConfig();
    const result = calculate(state, cfg);
    const html = buildProposalHtml(result, inputs);

    const modal = document.createElement('div');
    modal.id = 'aeProposalPreviewModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content modal-content-wide">
        <div class="modal-header-row">
          <h2>Proposal Preview</h2>
          <button class="btn btn-primary btn-copy" id="aePropCopy">Copy to Clipboard</button>
        </div>
        <div class="email-preview" id="aePropPreviewContent">${html}</div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="aePropClose">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('aePropClose').addEventListener('click', () => modal.remove());
    document.getElementById('aePropCopy').addEventListener('click', () => {
      const previewEl = document.getElementById('aePropPreviewContent');
      const btn = document.getElementById('aePropCopy');
      function showCopied() {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy to Clipboard'; }, 2000);
      }
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        const htmlBlob = new Blob([previewEl.innerHTML], { type: 'text/html' });
        const textBlob = new Blob([previewEl.innerText], { type: 'text/plain' });
        navigator.clipboard.write([
          new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })
        ]).then(showCopied).catch(() => { copyViaSelection(previewEl); showCopied(); });
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

  function summarizeAreasByType(scopes) {
    const out = { remodel: { cond: 0, uncond: 0 }, addition: { cond: 0, uncond: 0 }, new_construction: { cond: 0, uncond: 0 } };
    (scopes || []).forEach((sc) => {
      const t = out[sc.type] ? sc.type : 'new_construction';
      out[t].cond   += (sc.conditionedSf || 0);
      out[t].uncond += (sc.unconditionedSf || 0);
    });
    return out;
  }

  function findLine(result, lineId) {
    for (const sect of result.sections) {
      for (const l of sect.lines) {
        if (l.id === lineId) return l;
      }
    }
    return null;
  }

  function buildProposalHtml(result, inputs) {
    // Arial 11pt on every element, including headings, per template request.
    // Tight vertical rhythm to reduce white space on paste.
    const font = 'font-family: Arial, Helvetica, sans-serif; font-size: 11pt; margin: 0 0 3pt 0;';
    // Heading style resets any list indentation Google Docs tries to carry
    // over from the preceding <ul>, plus bit more breathing room above.
    const heading = `font-family: Arial, Helvetica, sans-serif; font-size: 11pt; margin: 10pt 0 3pt 0; padding-left: 0; text-indent: 0;`;
    const cfg = ensureConfig();
    const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
    const hoursWhole = (n) => Math.round(n || 0);

    const projectAddress = (state.identity.projectAddress || '').trim() || '[Project Address]';

    const programItems = (state.programItems || []).filter((it) => (it.text || '').trim());
    const scopes       = state.program.scopes || [];
    const areasByType  = summarizeAreasByType(scopes);
    const buildGradeLabel = (window.aeConfig.BUILD_GRADE_LABELS || {})[state.program.buildGrade] || state.program.buildGrade;
    const structComplexityLabel = (cfg.structuralComplexityLabels || { low: 'Low', medium: 'Medium', high: 'High' })[state.program.structuralComplexity] || state.program.structuralComplexity;

    const effCost = result.stage1.effCost;
    const structuralCaLine = findLine(result, 'structural_ca');
    const structuralCaFee = (structuralCaLine && !structuralCaLine.excluded) ? structuralCaLine.effDollars : 0;

    // Total design fee excludes Structural CA per template convention.
    const totalDesignFee = result.grandTotal.dollars - (structuralCaLine && !structuralCaLine.excluded ? structuralCaLine.effDollars : 0);
    const totalHours     = result.grandTotal.hours - (structuralCaLine && !structuralCaLine.excluded ? structuralCaLine.effHours : 0);

    // ---- Fee breakdown table ----
    // Section header row shows the section name + subtotal hours + subtotal
    // fee. Line items below are indented. Structural CA is excluded from the
    // table (shown separately). Hours rounded to whole numbers.
    const feeTableHtml = (() => {
      const rows = [];
      result.sections.forEach((sect) => {
        const activeLines = sect.lines.filter((l) => !l.excluded && l.effDollars > 0 && l.id !== 'structural_ca');
        if (activeLines.length === 0) return;
        const subtotalHours   = activeLines.reduce((s, l) => s + (l.effHours   || 0), 0);
        const subtotalDollars = activeLines.reduce((s, l) => s + (l.effDollars || 0), 0);
        rows.push(`<tr>
          <td style="${font} padding: 4pt 6pt 1pt 6pt; border-top: 1px solid #bbb;"><strong>${escapeHtml(sect.label)}</strong></td>
          <td style="${font} padding: 4pt 6pt 1pt 6pt; border-top: 1px solid #bbb; text-align: right;"><strong>${hoursWhole(subtotalHours)}</strong></td>
          <td style="${font} padding: 4pt 6pt 1pt 6pt; border-top: 1px solid #bbb; text-align: right;"><strong>${money(subtotalDollars)}</strong></td>
        </tr>`);
        activeLines.forEach((l) => {
          rows.push(`<tr>
            <td style="${font} padding: 0 6pt 0 18pt;">${escapeHtml(l.label)}</td>
            <td style="${font} padding: 0 6pt; text-align: right;">${hoursWhole(l.effHours) || '—'}</td>
            <td style="${font} padding: 0 6pt; text-align: right;">${money(l.effDollars)}</td>
          </tr>`);
        });
      });
      // Grand total row at the bottom, separated by a heavier horizontal line.
      rows.push(`<tr>
        <td style="${font} padding: 6pt 6pt 2pt 6pt; border-top: 2px solid #555;"><strong>Total Design Fee</strong></td>
        <td style="${font} padding: 6pt 6pt 2pt 6pt; border-top: 2px solid #555; text-align: right;"><strong>${hoursWhole(totalHours)}</strong></td>
        <td style="${font} padding: 6pt 6pt 2pt 6pt; border-top: 2px solid #555; text-align: right;"><strong>${money(totalDesignFee)} (+/- 10%)</strong></td>
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

    // ---- Scope-of-Services line helper: description or "not in scope" ----
    const inScope = (lineId) => {
      const l = findLine(result, lineId);
      return !!(l && !l.excluded && l.effDollars > 0);
    };
    const scopeBullet = (lineId, label, description) => {
      return `<li style="${font}"><strong>${label}:</strong> ${inScope(lineId) ? description : 'not in scope'}</li>`;
    };

    // ---- Program bullets ----
    const programListHtml = programItems.length === 0
      ? `<li style="${font}">[Program Item — add in the estimator]</li>`
      : programItems.map((it) => `<li style="${font}">${escapeHtml(it.text)}</li>`).join('');

    // ---- Area assumption bullets (one line per type that has scopes) ----
    const areaLines = [];
    const areaLine = (label, typeKey) => {
      const a = areasByType[typeKey];
      if ((a.cond + a.uncond) === 0) return;
      areaLines.push(`<li style="${font}"><strong>${label}:</strong> Approximately ${a.cond.toLocaleString()} conditioned and ${a.uncond.toLocaleString()} unconditioned square feet.</li>`);
    };
    areaLine('Remodeled Area', 'remodel');
    areaLine('Addition Area', 'addition');
    areaLine('New Construction Area', 'new_construction');

    // ---- Static template content ----
    const scopeNarrative = `
      <h1 style="${heading}"><strong>1. PROJECT DESCRIPTION</strong></h1>
      <p style="${font}">This project consists of design and structural engineering services for a ${escapeHtml(inputs.proposedScope || '[proposed scope]')} at ${escapeHtml(projectAddress)}. The estimate that follows is based on the program and assumptions described in this section. Material changes to either may require an adjustment to the estimated fee.</p>
      <p style="${font}"><strong>Program</strong></p>
      <ul style="${font}">${programListHtml}</ul>
      <p style="${font}"><strong>Project Assumptions</strong></p>
      <p style="${font}">The estimate assumes the following. Variations from these assumptions may affect scope, schedule, or fee.</p>
      <ul style="${font}">
        <li style="${font}"><strong>Build Grade:</strong> ${escapeHtml(buildGradeLabel)}</li>
        ${areaLines.join('')}
        <li style="${font}"><strong>Structural Complexity:</strong> ${escapeHtml(structComplexityLabel)}.</li>
        <li style="${font}">[Additional Assumptions Here]</li>
      </ul>

      <h1 style="${heading}"><strong>2. SCOPE OF SERVICES</strong></h1>
      <p style="${font}"><strong>Pre-Design &mdash;</strong> Establish the foundation for the project by gathering existing conditions, exploring design direction, and validating program and budget before formal design begins.</p>
      <ul style="${font}">
        ${scopeBullet('site_visit', 'Site / Assessment', 'On-site evaluation to document existing conditions, perform preliminary framing/foundation analysis, and capture the space via 3D scan or 360&deg; video.')}
        ${scopeBullet('scan', '3D Scan', 'Laser scan of the existing structure or site to capture accurate spatial data. Produces a point cloud that serves as the basis for the digital base model.')}
        ${scopeBullet('base_model', 'Base Model', '3D digital model of existing conditions developed from scan data, survey, or field measurement. Serves as the geometric starting point for design and ensures dimensional accuracy throughout the project.')}
        ${scopeBullet('as_builts', 'As-Builts', 'Drawings of existing structures including floor plans, elevations, and key sections. Required for renovations, additions, and any work that interfaces with existing construction.')}
        ${scopeBullet('feasibility_concept', 'Feasibility / Concept', 'Preliminary design exploration, program validation against site constraints and budget, and conceptual sketches and massing studies. Answers the question "is this project viable as imagined?" before significant design effort begins.')}
      </ul>
      <p style="${font}"><strong>Design &mdash;</strong> Develop the project from concept through dimensioned, coordinated drawings ready for construction documentation.</p>
      <ul style="${font}">
        ${scopeBullet('schematic_design', 'Schematic Design', 'Translation of the project program into a coordinated design concept. Includes preliminary site plan, floor plans, building elevations, and sections sufficient to establish overall building geometry, square footage, major spatial relationships, and general material and system selections.')}
        ${scopeBullet('design_development', 'Design Development', 'Continued refinement of the approved Schematic Design as needed in order to generate fully coordinated construction documents. Includes revisions to the geometry, assembly decisions, preliminary structural coordination, casework layouts, material and fixture selections, etc.')}
      </ul>
      <p style="${font}"><strong>Construction Documents &mdash;</strong> Produce the drawings and specifications required to permit, bid, and build the project, in three sequential issuances.</p>
      <ul style="${font}">
        ${scopeBullet('permit_set', 'Permit-Level Set', 'Essential drawings strictly for municipal review (site, demo, floor, and roof plans; door/window schedules; basic exterior elevations).')}
        ${scopeBullet('bid_set', 'Bid-Level Set', 'Permit Set plus detail for contractor pricing (basic interior elevations, building sections, typical assemblies, and generic power/lighting/finish layouts).')}
        ${scopeBullet('construction_set', 'Construction-Level Set', 'Bid Set plus highly detailed build guides (exact appliance/fixture/finish specifications, material instructions, and custom assembly details).')}
      </ul>
      <p style="${font}"><strong>Structural Engineering &mdash;</strong> ${inScope('structural_engineering') ? "Design the project's structural system including foundation, framing, lateral systems, and connections. Includes structural drawings issued with each Construction Document set, structural calculations and code compliance documentation, and coordination of structural details with the architectural drawings and specifications." : 'not in scope'}</p>
      <p style="${font}"><strong>Construction Phase Services &mdash;</strong> Support the project during construction in design and structural advisory roles.</p>
      <ul style="${font}">
        ${scopeBullet('bidding_negotiation', 'Bidding / Negotiation', 'Assistance with obtaining and evaluating contractor proposals including bid package issuance, response to contractor questions, addenda preparation, bid leveling and comparison, and recommendations to the Owner.')}
        ${scopeBullet('permit_submittals', 'Permit Submittals', 'Preparation and submission of permit application materials to the Authority Having Jurisdiction, management of the submittal process, and coordination with permit reviewers as needed to advance the project through permit review.')}
        ${scopeBullet('city_comment_revisions', 'City Comment Revisions', 'Response to plan review comments from the authority having jurisdiction and revisions to drawings and specifications as required to obtain permit approval. Scope depends on the comments received and is billed hourly.')}
        ${scopeBullet('design_ca', 'Design CA', 'Design-side support during construction including periodic site observation visits, response to contractor Requests for Information (RFIs) related to design intent, review of shop drawings and submittals for conformance with the design, material and finish approvals, design clarifications and field-issued sketches, and the punch list at substantial completion. Site observations are conducted to become familiar with the progress and quality of the Work; continuous on-site inspection is not provided.')}
        ${scopeBullet('structural_ca', 'Structural CA', 'Structural-side support during construction including site observation of structural construction at key milestones (foundation, framing), response to contractor RFIs related to structural design, review of structural shop drawings and submittals, and field clarifications of structural details.')}
      </ul>
    `;

    const timelineHtml = `
      <h1 style="${heading}"><strong>3. TIMELINE &amp; DELIVERABLES</strong></h1>
      <p style="${font}">All project timelines commence upon receipt of the signed contract, retainer payment, and necessary client-provided site data (e.g., survey, soils report).</p>
      <p style="${font}"><strong>Pre-Design:</strong></p>
      <ul style="${font}">
        <li style="${font}"><strong>Deliverables:</strong> Feasibility / Zoning Analysis, Concept sketches / Massing options</li>
        <li style="${font}"><strong>Approximate Duration:</strong> ${inputs.pdWks} weeks</li>
      </ul>
      <p style="${font}"><strong>Schematic Design:</strong></p>
      <ul style="${font}">
        <li style="${font}"><strong>Deliverables:</strong> Schematic Approval Set</li>
        <li style="${font}"><strong>Approximate Duration:</strong> ${inputs.sdWks} weeks (depending on iterations)</li>
        <li style="${font}">*Client approval at this stage establishes the "Design Freeze."</li>
      </ul>
      <p style="${font}"><strong>Design Development / Construction Documents:</strong> Creation of a detailed set of drawings required for permitting, bidding, and construction.</p>
      <ul style="${font}">
        <li style="${font}"><strong>Deliverables (after Design Freeze):</strong></li>
      </ul>
      <ul style="${font}">
        <li style="${font} margin-left: 22px;">Permit Set &ndash; ${inputs.permitWks} weeks</li>
        <li style="${font} margin-left: 22px;">Structural Set &ndash; ${inputs.seWks} weeks</li>
        <li style="${font} margin-left: 22px;">Bid Set &ndash; ${inputs.bidWks} weeks</li>
        <li style="${font} margin-left: 22px;">Construction Set &ndash; ${inputs.cdWks} weeks</li>
      </ul>
      <p style="${font}"><strong>Construction Phase Services:</strong></p>
      <ul style="${font}">
        <li style="${font}"><strong>Deliverables:</strong> RFI responses, field observation reports, and certification letters if compliant.</li>
        <li style="${font}"><strong>Due Date:</strong> Ongoing through substantial completion.</li>
      </ul>
    `;

    const compensationHtml = `
      <h1 style="${heading}"><strong>4. COMPENSATION</strong></h1>
      <p style="${font}">The following estimates are based on an anticipated effort to complete each service, based on the scope defined in earlier sections, and a blended hourly rate.</p>
      ${feeTableHtml}
      <p style="${font} margin-left: 30px; margin-right: 30px;"><strong>Note:</strong> Okkem Design typically completes projects of this type within approximately 10% of the estimated fee. Should projected fees exceed this threshold due to scope changes or unforeseen conditions, we will notify the Client and provide a revised estimate for approval.</p>
      <p style="${font}"><strong>Structural CA</strong> is provided as a separate service. Based on the current scope&mdash;which includes wood framing, concrete footings/piers, limited steel hardware, and two required structural inspections&mdash;Okkem Design anticipates a Structural CA budget of <strong>${structuralCaFee > 0 ? money(structuralCaFee) : '[not included]'}</strong>.</p>
      <p style="${font}">This CA fee will be confirmed in a separate communication issued after the completion of the Structural Design phase.</p>
      <p style="${font}"><strong>Hourly Rate Schedule</strong></p>
      <ul style="${font}">
        <li style="${font}">Licensed Design Professional: $190/hr</li>
        <li style="${font}">Project Coordination: $160/hr</li>
        <li style="${font}">Non-Licensed Staff: $130/hr</li>
      </ul>
    `;

    const retainerHtml = (inputs.retainer && inputs.retainer > 0)
      ? `<strong>${money(inputs.retainer)}</strong>`
      : '<strong>[Retainer Amount]</strong>';
    const paymentHtml = `
      <h1 style="${heading}"><strong>5. PAYMENT TERMS</strong></h1>
      <ul style="${font}">
        <li style="${font}"><strong>Retainer:</strong> A ${retainerHtml} retainer is required to initiate services. The retainer will be applied to the final invoice. Any unused balance will be refunded at project completion.</li>
        <li style="${font}"><strong>Invoicing:</strong> Invoices are typically issued when accumulated fees exceed $2,000, upon delivery of a major milestone, or prior to a project pause.</li>
        <li style="${font}"><strong>Terms:</strong> Payment is due within 7 days of invoice issuance. Unpaid invoices may result in a pause in services. All outstanding invoices must be paid in full prior to release of the final sealed drawings.</li>
      </ul>
    `;

    const assumptionsHtml = `
      <h1 style="${heading}"><strong>6. ASSUMPTIONS &amp; EXCLUSIONS</strong></h1>
      <p style="${font}">Because Okkem Design is executing both the visual design and the structural engineering, the project requires strict adherence to phase approvals to prevent costly rework.</p>
      <ul style="${font}">
        <li style="${font}"><strong>The "Design Freeze" and Rework:</strong> Once the Client formally approves the layout, the spatial geometry is considered frozen. Any subsequent client-initiated changes to rooflines, footprints, wall locations, or window/door sizes will require engineering rework and will be billed hourly in addition to the estimated fees.</li>
        <li style="${font}"><strong>Third-Party Data:</strong> Our structural engineering calculations assume the accuracy of the boundary/topographic survey and the Geotechnical (soils) report provided directly by the Client. We hold no liability for structural issues arising from inaccurate third-party site data.</li>
        <li style="${font}"><strong>Excluded Engineering Disciplines:</strong> Mechanical, Electrical, Plumbing (MEP), and Civil Engineering (e.g., grading, drainage, stormwater management) are explicitly excluded and must be provided by separate consultants contracted directly by the Client.</li>
        <li style="${font}"><strong>Interior Decor and Finishes:</strong> Unless explicitly listed in the scope, the selection and specification of interior decor, paint colors, fixtures, and non-structural cabinetry are excluded.</li>
        <li style="${font}"><strong>Means and Methods:</strong> Okkem Design is not responsible for construction safety, sequencing, or the builder's means and methods on the job site.</li>
        <li style="${font}"><strong>Reimbursable Expenses:</strong> Municipal permitting fees, specialty printing, and required courier services are not included in the fee estimate and will be billed at cost plus a standard 10% administrative markup.</li>
        <li style="${font}"><strong>Connections:</strong> Unless specifically detailed in the architectural drawings, connections use standard, commercially available hardware with published load data; custom/architectural connection design is excluded.</li>
        <li style="${font}"><strong>Guardrails:</strong> Guardrail systems are assumed to be prescriptive or manufacturer-engineered; Okkem Design will design only the supporting framing and blocking.</li>
        <li style="${font}"><strong>Site Access:</strong> Site access must allow standard visual observation without special equipment or confined-space requirements.</li>
        <li style="${font}"><strong>Reimbursable Expenses:</strong> Expenses such as municipal fees or specialty tools will be billed at cost with Client approval.</li>
        <li style="${font}"><strong>Specific Exclusions:</strong> [List additional Exclusions as needed]</li>
      </ul>
    `;

    return `<div style="${font} color: #000; line-height: 1.2;">
      ${scopeNarrative}
      ${timelineHtml}
      ${compensationHtml}
      ${paymentHtml}
      ${assumptionsHtml}
      ${inputs.yourName ? `<p style="${font} margin-top: 12pt;">${escapeHtml(inputs.yourName)}</p>` : ''}
    </div>`;
  }

  function saveForm() {
    // All edits commit on change; nothing pending here.
  }

  window.aeEstimate = {
    render,
    saveForm,
    getState: () => state,
    getProjectName: () => state.identity.projectAddress || '',
    setState: (newState) => {
      state = Object.assign(makeInitialState(), newState || {});
      // Backfill nested structure to keep render() safe against older shapes.
      const empty = makeInitialState();
      ['identity', 'program', 'stage1Overrides', 'stage2', 'manualHours'].forEach((k) => {
        state[k] = Object.assign(empty[k], state[k] || {});
      });
      if (!Array.isArray(state.additionalServices)) state.additionalServices = [];
      if (!state.lineOverrides || typeof state.lineOverrides !== 'object') state.lineOverrides = {};
      if (!state.lineExclusions || typeof state.lineExclusions !== 'object') state.lineExclusions = {};
      // Drop legacy CD Level field (replaced by per-line include/exclude).
      delete state.stage2.cdLevel;
      // Drop legacy "feasibility" manual hours / overrides (line removed).
      if (state.manualHours) delete state.manualHours.feasibility;
      if (state.lineOverrides) delete state.lineOverrides.feasibility;
      if (state.lineExclusions) delete state.lineExclusions.feasibility;
      // Migrate older saves: flat sf/spaces fields → single Area 1.
      if (!Array.isArray(state.program.scopes) || state.program.scopes.length === 0) {
        state.program.scopes = [makeScope(
          'Area 1',
          state.program.conditionedSf || 0,
          state.program.conditionedSpaces || 0,
          state.program.unconditionedSf || 0,
          state.program.unconditionedSpaces || 0
        )];
      }
      state.program.scopes = normalizeScopes(state.program.scopes);
      // Drop legacy projectType field (UI removed).
      if (state.identity) delete state.identity.projectType;
      // Migrate legacy projectName into projectAddress.
      if (state.identity && state.identity.projectName && !state.identity.projectAddress) {
        state.identity.projectAddress = state.identity.projectName;
      }
      if (state.identity) delete state.identity.projectName;
      // Backfill programItems (narrative list).
      if (!Array.isArray(state.programItems)) state.programItems = [];
      // Drop legacy top-level fields so they can't drift out of sync.
      delete state.program.conditionedSf;
      delete state.program.conditionedSpaces;
      delete state.program.unconditionedSf;
      delete state.program.unconditionedSpaces;
      // Per-project config: if missing (older v3 or v2 imports), fall back to
      // the user's saved defaults.
      if (!state.config || typeof state.config !== 'object') {
        state.config = window.aeConfig.loadConfig();
      }
      refreshExportSnapshot();
      render();
    },
    reset: () => {
      const preservedConfig = state.config;
      state = makeInitialState();
      state.config = preservedConfig;
      refreshExportSnapshot();
      render();
    },
    getConfig: () => { ensureConfig(); return state.config; },
    setConfig: (cfg) => { state.config = cfg; render(); },
    // Exposed for tests / debugging:
    _calculate: calculate,
  };

  // ---------- Unload guard ----------
  // Browser shows generic "leave site?" prompt when either:
  //  - per-project work has changed since the last Export Estimate, OR
  //  - default-able fields differ from the saved program defaults.
  // Save as Default clears the default drift; Export Estimate clears the
  // per-project drift.

  function extractPerProjectState(s) {
    return {
      identity: s.identity || {},
      programItems: s.programItems || [],
      stage1Overrides: s.stage1Overrides || {},
      activeFlags: (s.stage2 && s.stage2.activeFlags) || [],
      manualHours: s.manualHours || {},
      additionalServices: s.additionalServices || [],
      lineOverrides: s.lineOverrides || {},
      // lineExclusions is now default-able, not per-project.
    };
  }

  let lastExportedPerProject = null;
  function refreshExportSnapshot() {
    lastExportedPerProject = JSON.stringify(extractPerProjectState(state));
  }

  function perProjectIsDirty() {
    if (lastExportedPerProject == null) refreshExportSnapshot();
    return JSON.stringify(extractPerProjectState(state)) !== lastExportedPerProject;
  }

  function programDefaultsAreDrifted() {
    const saved = window.aeConfig.loadProgramDefaults();
    const baseline = saved ? Object.assign(shippedProgramDefaults(), saved) : shippedProgramDefaults();
    // Compare current defaults-shaped values against the saved baseline.
    const current = extractProgramDefaults(state);
    const baselineShaped = {
      scopes: baseline.scopes || [],
      buildGrade: baseline.buildGrade,
      structuralComplexity: baseline.structuralComplexity,
      buildingCategory: baseline.buildingCategory,
      projectComplexity: baseline.projectComplexity,
      regionalMultiplier: baseline.regionalMultiplier,
      lineExclusions: baseline.lineExclusions || {},
    };
    return JSON.stringify(current) !== JSON.stringify(baselineShaped);
  }

  function hasUnsavedWork() {
    if (!state) return false;
    return perProjectIsDirty() || programDefaultsAreDrifted();
  }

  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedWork()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Initial render — runs as the page loads.
  render();
})();
