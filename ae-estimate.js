// A/E Estimate — Architecture + Engineering full-scope fee estimate module

(function () {
  const app = document.getElementById('app');

  // ---------- Line/section definitions ----------

  const LINE_LABELS = {
    feasibility: 'Feasibility',
    site_visit: 'Site Visit',
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
    'feasibility', 'site_visit', 'scan', 'base_model', 'as_builts', 'permit_submittals',
  ]);

  const SECTIONS = [
    { id: 'pre-design',             label: 'Pre-Design',                  lineIds: ['feasibility', 'site_visit', 'scan', 'base_model', 'as_builts', 'feasibility_concept'] },
    { id: 'design',                 label: 'Design',                      lineIds: ['schematic_design', 'design_development'] },
    { id: 'cd',                     label: 'Construction Documents',      lineIds: ['permit_set', 'bid_set', 'construction_set'] },
    { id: 'structural-engineering', label: 'Structural Engineering',      lineIds: ['structural_engineering'] },
    { id: 'construction-phase',     label: 'Construction Phase Services', lineIds: ['bidding_negotiation', 'permit_submittals', 'city_comment_revisions', 'design_ca', 'structural_ca'] },
    { id: 'additional-services',    label: 'Additional Services',         lineIds: [] },
  ];

  const CD_LEVEL_ORDER = { permit_set: 1, bid_set: 2, construction_set: 3 };

  // ---------- State ----------

  let state = makeInitialState();
  const collapsedSections = new Set();

  function makeScope(name, condSf, condSpaces, uncondSf, uncondSpaces) {
    return {
      id: 'scope_' + Math.random().toString(36).slice(2, 10),
      name: name || '',
      conditionedSf: condSf || 0,
      conditionedSpaces: condSpaces || 0,
      unconditionedSf: uncondSf || 0,
      unconditionedSpaces: uncondSpaces || 0,
    };
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

  function makeInitialState() {
    return {
      identity: {
        projectName: '',
        clientName: '',
        projectType: 'new',
      },
      program: {
        scopes: [makeScope('Scope 1', 3000, 12, 600, 1)],
        buildGrade: 'mid_custom',
        structuralComplexity: 'medium',
        buildingCategory: '7',
        projectComplexity: 'normal',
      },
      stage1Overrides: {
        conditionedRate: null,
        unconditionedRate: null,
        constructionCost: null,
      },
      stage2: {
        activeFlags: [],
        cdLevel: 'construction_set',
      },
      manualHours: {
        feasibility: 0,
        site_visit: 0,
        scan: 0,
        base_model: 0,
        as_builts: 0,
        permit_submittals: 0,
      },
      additionalServices: [],
      lineOverrides: {},
    };
  }

  // ---------- Calculation (pure) ----------

  function calculate(s, cfg) {
    // Stage 1
    const grade = cfg.buildGrades[s.program.buildGrade] || cfg.buildGrades.mid_custom;
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

    const calcCondRate   = baseline.conditioned   * structuralMult1 * sizeMult * condDensityMult;
    const calcUncondRate = baseline.unconditioned * structuralMult1 * sizeMult * uncondDensityMult;

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

    const architectShare = Math.max(totalFeeBase - totalStructuralFee, 0);

    const pw = cfg.phaseWeights;
    const feasibilityConceptDollars = architectShare * pw.feasibilityConcept;
    const schematicDollars          = architectShare * pw.schematicDesign;
    const designDevelopmentDollars  = architectShare * pw.designDevelopment;
    const cdTotalDollars            = architectShare * pw.constructionDocuments;
    const biddingDollars            = architectShare * pw.biddingNegotiation;
    const designCaDollars           = architectShare * pw.constructionAdministration;

    // CD sub-levels with gating
    const selectedCdOrder = CD_LEVEL_ORDER[s.stage2.cdLevel] || 3;
    let permitSetDollars      = cdTotalDollars * cfg.cdSubLevelSplit.permitSet;
    let bidSetDollars         = cdTotalDollars * cfg.cdSubLevelSplit.bidSet;
    let constructionSetDollars = cdTotalDollars * cfg.cdSubLevelSplit.constructionSet;
    if (selectedCdOrder < CD_LEVEL_ORDER.bid_set)          bidSetDollars = 0;
    if (selectedCdOrder < CD_LEVEL_ORDER.construction_set) constructionSetDollars = 0;

    // Permit set regulatory uplift
    const activeFlags = cfg.regulatoryFlags.filter((f) => (s.stage2.activeFlags || []).includes(f.id));
    const permitSetUpliftSum = activeFlags.reduce((sum, f) => sum + (f.permitSetAdder || 0), 0);
    const permitSetUpliftFactor = 1 + permitSetUpliftSum;
    permitSetDollars = permitSetDollars * permitSetUpliftFactor;

    // City comment revisions
    const cityCommentsUpliftSum = activeFlags.reduce((sum, f) => sum + (f.cityCommentsAdder || 0), 0);
    const cityCommentsUpliftFactor = 1 + cityCommentsUpliftSum;
    const cityCommentsDollars = architectShare * cfg.cityCommentsBasePct * cityCommentsUpliftFactor;

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
      cityCommentsUpliftFactor,
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
      design_ca: designCaDollars,
      structural_ca: structuralCaDollars,
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
        });
      });

      // Additional Services section: user-managed lines
      if (sect.id === 'additional-services') {
        (s.additionalServices || []).forEach((item) => {
          const rate = item.rate || 0;
          const hours = item.hours || 0;
          const dollars = item.dollars != null ? item.dollars : hours * rate;
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
          });
        });
      }

      const totalHours = lines.reduce((sum, l) => sum + (l.effHours || 0), 0);
      const totalDollars = lines.reduce((sum, l) => sum + (l.effDollars || 0), 0);
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
    const cfg = window.aeConfig.loadConfig();
    const result = calculate(state, cfg);

    app.innerHTML = `
      <div class="estimate-form ae-form">
        <div class="form-header">
          <h2>A/E Estimate</h2>
          <div style="display:flex; gap:0.5rem;">
            <button class="btn btn-secondary" id="aeBtnImport">Import</button>
            <button class="btn btn-secondary" id="aeBtnReset">Reset</button>
          </div>
        </div>

        ${renderIdentitySection()}
        ${renderProgramSection()}
        ${renderStage1Section(cfg, result)}
        ${renderStage2Section(cfg, result)}
        ${renderOutput(result)}

        <div class="form-actions">
          <button class="btn btn-primary" id="aeBtnExport">Export Estimate</button>
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
          <div class="form-group" style="flex:2">
            <label for="aeProjectName">Project Name</label>
            <input type="text" id="aeProjectName" value="${escapeAttr(i.projectName)}" placeholder="e.g. Smith Residence">
          </div>
          <div class="form-group" style="flex:2">
            <label for="aeClientName">Client</label>
            <input type="text" id="aeClientName" value="${escapeAttr(i.clientName)}" placeholder="Client name">
          </div>
          <div class="form-group" style="flex:1">
            <label for="aeProjectType">Type</label>
            <select id="aeProjectType">
              ${['new', 'addition', 'renovation', 'adaptive_reuse'].map((t) => `<option value="${t}" ${i.projectType === t ? 'selected' : ''}>${projectTypeLabel(t)}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
    `;
  }

  function projectTypeLabel(t) {
    return { new: 'New', addition: 'Addition', renovation: 'Renovation', adaptive_reuse: 'Adaptive Reuse' }[t] || t;
  }

  function renderProgramSection() {
    const p = state.program;
    const cfg = window.aeConfig.loadConfig();
    const scopes = p.scopes || [];
    const totals = sumScopes(scopes);
    const canRemove = scopes.length > 1;

    return `
      <div class="form-section">
        <h3>Program</h3>
        <div class="ae-scopes">
          <div class="ae-scope-row ae-scope-header">
            <span>Scope</span>
            <span>Cond sf</span>
            <span>Cond spaces</span>
            <span>Uncond sf</span>
            <span>Uncond spaces</span>
            <span></span>
          </div>
          ${scopes.map((sc) => `
            <div class="ae-scope-row" data-scope-id="${sc.id}">
              <input type="text"   class="ae-scope-name"  data-scope-id="${sc.id}" value="${escapeAttr(sc.name)}" placeholder="Scope name">
              <input type="number" class="ae-scope-csf"   data-scope-id="${sc.id}" min="0" step="50" value="${sc.conditionedSf || 0}">
              <input type="number" class="ae-scope-csp"   data-scope-id="${sc.id}" min="0" step="1"  value="${sc.conditionedSpaces || 0}">
              <input type="number" class="ae-scope-usf"   data-scope-id="${sc.id}" min="0" step="50" value="${sc.unconditionedSf || 0}">
              <input type="number" class="ae-scope-usp"   data-scope-id="${sc.id}" min="0" step="1"  value="${sc.unconditionedSpaces || 0}">
              ${canRemove ? `<button class="ae-scope-remove" data-scope-id="${sc.id}" title="Remove scope">×</button>` : '<span></span>'}
            </div>
          `).join('')}
          <div class="ae-scope-row ae-scope-totals">
            <span>Total (${scopes.length} scope${scopes.length === 1 ? '' : 's'})</span>
            <span>${totals.conditionedSf.toLocaleString()}</span>
            <span>${totals.conditionedSpaces}</span>
            <span>${totals.unconditionedSf.toLocaleString()}</span>
            <span>${totals.unconditionedSpaces}</span>
            <span></span>
          </div>
          <div class="ae-add-row"><button class="btn btn-small" id="aeAddScopeBtn">+ Add Scope</button></div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="aeBuildGrade">Build Grade</label>
            <select id="aeBuildGrade">
              ${Object.keys(cfg.buildGrades).map((g) => `<option value="${g}" ${p.buildGrade === g ? 'selected' : ''}>${cfg.buildGradeLabels[g] || g}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="aeStructuralComplexity">Structural Complexity</label>
            <select id="aeStructuralComplexity">
              ${['low', 'medium', 'high'].map((c) => `<option value="${c}" ${p.structuralComplexity === c ? 'selected' : ''}>${cfg.structuralComplexityLabels[c] || c}</option>`).join('')}
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
        <p class="help-text">Break the project into scopes (e.g., "Master suite remodel", "Garage to ADU"). Totals roll into the calculation; scope names are organizational only. <strong>Cond spaces</strong>: named rooms inside the thermal envelope. <strong>Uncond spaces</strong>: garages, porches, covered outdoor areas.</p>
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
        <div class="ae-stage-summary">
          <span class="ae-stage-summary-label">Effective Construction Cost</span>
          <span class="ae-stage-summary-value">${fmtMoney(s1.effCost)}</span>
        </div>
      </div>
    `;
  }

  function renderStage2Section(cfg, result) {
    const sch = result.stage2.schedule;
    return `
      <div class="form-section">
        <h3>Stage 2 · Scope &amp; Regulatory</h3>
        <div class="form-row">
          <div class="form-group">
            <label for="aeCdLevel">CD Level</label>
            <select id="aeCdLevel">
              ${[
                { v: 'permit_set', l: 'Permit Set' },
                { v: 'bid_set', l: 'Bid Set' },
                { v: 'construction_set', l: 'Construction Set' },
              ].map((o) => `<option value="${o.v}" ${state.stage2.cdLevel === o.v ? 'selected' : ''}>${o.l}</option>`).join('')}
            </select>
          </div>
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
          <span class="ae-fee-breakdown-final">= ${(result.stage2.feePct * 100).toFixed(2)}%</span>
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
    const { sections, grandTotal, stage2 } = result;
    return `
      <div class="ae-output">
        <div class="ae-grand-total">
          <div class="ae-grand-total-item"><span class="ae-gt-label">Total Hours</span><span class="ae-gt-value">${fmtHours(grandTotal.hours)}</span></div>
          <div class="ae-grand-total-item"><span class="ae-gt-label">Total Fee</span><span class="ae-gt-value">${fmtMoney(grandTotal.dollars)}</span></div>
          <div class="ae-grand-total-item"><span class="ae-gt-label">Fee %</span><span class="ae-gt-value">${fmtPct(stage2.feePct)}</span></div>
        </div>
        ${sections.map((sect) => renderSection(sect)).join('')}
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
    const ghostCalc = l.isOverridden
      ? `<span class="ae-ghost-calc" title="Calculated value">(${fmtHours(l.calcHours)}h · ${fmtMoney(l.calcDollars)})</span>`
      : '';
    const resetBtn = l.isOverridden
      ? `<button class="ae-line-reset" data-reset-line="${l.id}" title="Reset to calculated">↺</button>`
      : '';
    const labelCell = l.isUser
      ? `<input type="text" class="ae-user-label" data-svc-id="${l.id}" value="${escapeAttr(l.label)}" placeholder="Service description">`
      : `<span>${escapeHtml(l.label)} ${overrideBadge}</span>`;
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

    return `
      <div class="ae-line-row ${l.isOverridden ? 'is-overridden' : ''}">
        <span class="ae-line-label">${labelCell}</span>
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
    attachText('aeProjectName',  (v) => { state.identity.projectName = v; }, false);
    attachText('aeClientName',   (v) => { state.identity.clientName = v; }, false);
    attachSelect('aeProjectType', (v) => { state.identity.projectType = v; render(); });

    // Program — scopes
    document.querySelectorAll('.ae-scope-name').forEach((el) => {
      el.addEventListener('change', () => {
        const sc = findScope(el.dataset.scopeId);
        if (sc) { sc.name = el.value; render(); }
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
        state.program.scopes.push(makeScope('Scope ' + n, 0, 0, 0, 0));
        render();
      });
    }

    attachSelect('aeBuildGrade',   (v) => { state.program.buildGrade = v; render(); });
    attachSelect('aeStructuralComplexity', (v) => { state.program.structuralComplexity = v; render(); });
    attachSelect('aeBuildingCategory', (v) => { state.program.buildingCategory = v; render(); });
    attachSelect('aeProjectComplexity', (v) => { state.program.projectComplexity = v; render(); });

    // Stage 1 overrides (empty string clears the override)
    attachNumberOrClear('aeCondRateOverride',   (v) => { state.stage1Overrides.conditionedRate = v; render(); });
    attachNumberOrClear('aeUncondRateOverride', (v) => { state.stage1Overrides.unconditionedRate = v; render(); });
    attachNumberOrClear('aeCostOverride',       (v) => { state.stage1Overrides.constructionCost = v; render(); });

    // Stage 2
    attachSelect('aeCdLevel', (v) => { state.stage2.cdLevel = v; render(); });

    // Fee schedule factor lives in config; edits persist to localStorage.
    const factorEl = document.getElementById('aeScheduleFactor');
    if (factorEl) {
      factorEl.addEventListener('change', () => {
        const raw = parseFloat(factorEl.value);
        const v = isFinite(raw) && raw >= 0 ? raw : 1.0;
        const cfg = window.aeConfig.loadConfig();
        cfg.feeSchedule.factor = v;
        window.aeConfig.saveConfig(cfg);
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
        const cfg = window.aeConfig.loadConfig();
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
    document.getElementById('aeBtnExport').addEventListener('click', () => { window.exportProject(); });
    document.getElementById('aeBtnImport').addEventListener('click', () => { window.importProject(); });
    document.getElementById('aeBtnReset').addEventListener('click', () => {
      if (confirm('Reset this A/E estimate? Settings are not affected.')) {
        state = makeInitialState();
        render();
      }
    });
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

  function saveForm() {
    // All edits commit on change; nothing pending here.
  }

  window.aeEstimate = {
    render,
    saveForm,
    getState: () => state,
    getProjectName: () => state.identity.projectName || '',
    setState: (newState) => {
      state = Object.assign(makeInitialState(), newState || {});
      // Backfill nested structure to keep render() safe against older shapes.
      const empty = makeInitialState();
      ['identity', 'program', 'stage1Overrides', 'stage2', 'manualHours'].forEach((k) => {
        state[k] = Object.assign(empty[k], state[k] || {});
      });
      if (!Array.isArray(state.additionalServices)) state.additionalServices = [];
      if (!state.lineOverrides || typeof state.lineOverrides !== 'object') state.lineOverrides = {};
      // Migrate older saves: flat sf/spaces fields → single Scope 1.
      if (!Array.isArray(state.program.scopes) || state.program.scopes.length === 0) {
        state.program.scopes = [makeScope(
          'Scope 1',
          state.program.conditionedSf || 0,
          state.program.conditionedSpaces || 0,
          state.program.unconditionedSf || 0,
          state.program.unconditionedSpaces || 0
        )];
      }
      // Drop legacy top-level fields so they can't drift out of sync.
      delete state.program.conditionedSf;
      delete state.program.conditionedSpaces;
      delete state.program.unconditionedSf;
      delete state.program.unconditionedSpaces;
      render();
    },
    reset: () => { state = makeInitialState(); render(); },
    // Exposed for tests / debugging:
    _calculate: calculate,
  };
})();
