// A/E Settings Modal — full configuration editor.
//
// Public API (called by ae-estimate.js):
//   window.aeSettings.open(currentConfig, onApply)
//     currentConfig: deep-cloneable config object (from state.config)
//     onApply(newConfig, alsoSaveAsDefault): callback invoked when user clicks
//       Apply (alsoSaveAsDefault=false) or Save as Default (true).
//
// Working-copy model: edits in the modal mutate a local clone. Apply / Save
// pass it back to the host; Cancel discards.

window.aeSettings = (function () {
  let workingCopy = null;
  let onApplyCb = null;
  let activeSectionId = 'rates';
  let modalEl = null;
  // JSON snapshot of working copy at last apply/save (or open if never applied).
  // Used to detect unsaved changes when the user closes the modal.
  let lastSnapshot = null;

  // Light hover-tooltip used for warning markers and curve interactions.
  let tooltipEl = null;

  // ---------- Section registry ----------

  const SECTIONS = [
    { id: 'rates',       label: 'Default Hourly Rates',  render: () => renderRates(),       bind: () => bindRates() },
    { id: 'grades',      label: 'Build Grades',          render: () => renderGrades(),      bind: () => bindGrades() },
    { id: 'struct-mult', label: 'Structural Multipliers', render: () => renderStructMult(), bind: () => bindStructMult() },
    { id: 'size-curve',  label: 'Size Curve',            render: () => renderSizeCurve(),   bind: () => bindSizeCurve() },
    { id: 'density',     label: 'Density Curves',        render: () => renderDensityCurves(), bind: () => bindDensityCurves() },
    { id: 'phase-wt',    label: 'Phase Weights',         render: () => renderPhaseWeights(), bind: () => bindPhaseWeights() },
    { id: 'cd-split',    label: 'CD Sub-Level Split',    render: () => renderCdSplit(),     bind: () => bindCdSplit() },
    { id: 'dd-split',    label: 'DD CD Split',           render: () => renderDdSplit(),     bind: () => bindDdSplit() },
    { id: 'ca-split',    label: 'CA CD Split',           render: () => renderCaSplit(),     bind: () => bindCaSplit() },
    { id: 'struct-set',  label: 'Structural Settings',   render: () => renderStructSet(),   bind: () => bindStructSet() },
    { id: 'min-fee',     label: 'Architect Minimum Fee', render: () => renderMinFee(),      bind: () => bindMinFee() },
    { id: 'city',        label: 'City Comments Base %',  render: () => renderCity(),        bind: () => bindCity() },
    { id: 'flags',       label: 'Regulatory Flags',      render: () => renderFlags(),       bind: () => bindFlags() },
    { id: 'backups',     label: 'Settings Backups',      render: () => renderBackups(),     bind: () => bindBackups() },
  ];

  // ---------- Public open ----------

  function open(currentConfig, onApply) {
    workingCopy = window.aeConfig.deepClone(currentConfig);
    lastSnapshot = JSON.stringify(workingCopy);
    onApplyCb = onApply;
    activeSectionId = SECTIONS[0].id;
    renderModal();
  }

  function close() {
    if (workingCopy && lastSnapshot !== null) {
      const current = JSON.stringify(workingCopy);
      if (current !== lastSnapshot) {
        if (!confirm('You have unsaved changes. Close without applying them?')) return;
      }
    }
    forceClose();
  }

  function forceClose() {
    if (modalEl) modalEl.remove();
    if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
    modalEl = null;
    workingCopy = null;
    onApplyCb = null;
    lastSnapshot = null;
  }

  // ---------- Modal scaffold ----------

  function renderModal() {
    if (modalEl) modalEl.remove();
    modalEl = document.createElement('div');
    modalEl.id = 'aeSettingsModal';
    modalEl.className = 'modal-overlay ae-settings-overlay';
    modalEl.innerHTML = `
      <div class="ae-settings-modal">
        <div class="ae-settings-header">
          <h2>A/E Settings</h2>
          <button class="ae-settings-close" id="aeSettingsCloseX" title="Cancel">&times;</button>
        </div>
        <div class="ae-settings-shell">
          <nav class="ae-settings-nav" id="aeSettingsNav">
            ${SECTIONS.map((s) => `
              <button class="ae-settings-nav-btn ${s.id === activeSectionId ? 'active' : ''}" data-section-id="${s.id}">${escapeHtml(s.label)}</button>
            `).join('')}
            <div class="ae-settings-nav-spacer"></div>
            <button class="ae-settings-nav-aux" id="aeSettingsExport">Export Settings</button>
            <button class="ae-settings-nav-aux" id="aeSettingsImport">Import Settings</button>
          </nav>
          <div class="ae-settings-body" id="aeSettingsBody">
            <!-- section contents render here -->
          </div>
        </div>
        <div class="ae-settings-footer">
          <button class="btn btn-secondary" id="aeSettingsResetDefaults">Reset to Defaults</button>
          <div class="ae-settings-footer-spacer"></div>
          <button class="btn btn-secondary" id="aeSettingsCancel">Close</button>
          <button class="btn btn-secondary" id="aeSettingsApply">Apply</button>
          <button class="btn btn-primary" id="aeSettingsSaveDefault">Save as Default</button>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);
    bindModalChrome();
    renderSectionBody();
  }

  function bindModalChrome() {
    document.getElementById('aeSettingsCloseX').addEventListener('click', close);
    document.getElementById('aeSettingsCancel').addEventListener('click', close);
    document.getElementById('aeSettingsApply').addEventListener('click', (e) => apply(false, e.currentTarget, 'Applied'));
    document.getElementById('aeSettingsSaveDefault').addEventListener('click', (e) => apply(true, e.currentTarget, 'Saved'));
    document.getElementById('aeSettingsResetDefaults').addEventListener('click', () => {
      if (!confirm('Reset working copy to your last saved defaults?')) return;
      workingCopy = window.aeConfig.loadConfig();
      renderSectionBody();
    });
    document.getElementById('aeSettingsExport').addEventListener('click', exportSettings);
    document.getElementById('aeSettingsImport').addEventListener('click', importSettings);
    document.getElementById('aeSettingsNav').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-section-id]');
      if (!btn) return;
      activeSectionId = btn.dataset.sectionId;
      modalEl.querySelectorAll('.ae-settings-nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.sectionId === activeSectionId));
      renderSectionBody();
    });
  }

  function apply(asDefault, btn, flashLabel) {
    if (!onApplyCb) return;
    // Pass a deep clone so further modal edits don't mutate the host's state.
    onApplyCb(window.aeConfig.deepClone(workingCopy), !!asDefault);
    lastSnapshot = JSON.stringify(workingCopy);
    if (btn) flashButton(btn, flashLabel);
  }

  function flashButton(btn, label) {
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

  function renderSectionBody() {
    const sect = SECTIONS.find((s) => s.id === activeSectionId);
    const body = document.getElementById('aeSettingsBody');
    body.innerHTML = `<div class="ae-settings-section"><h3>${escapeHtml(sect.label)}</h3>${sect.render()}</div>`;
    if (sect.bind) sect.bind();
    bindWarningTooltips();
  }

  // ---------- Warning marker helper ----------

  function warnBadge(msg) {
    return `<span class="ae-warn" data-warn="${escapeAttr(msg)}" title="${escapeAttr(msg)}">⚠</span>`;
  }

  function bindWarningTooltips() {
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'ae-tooltip';
      tooltipEl.style.display = 'none';
      document.body.appendChild(tooltipEl);
    }
    modalEl.querySelectorAll('[data-warn]').forEach((el) => {
      el.addEventListener('mouseenter', (e) => {
        tooltipEl.textContent = el.dataset.warn;
        tooltipEl.style.display = 'block';
        positionTooltip(e);
      });
      el.addEventListener('mousemove', positionTooltip);
      el.addEventListener('mouseleave', () => { tooltipEl.style.display = 'none'; });
    });
  }

  function positionTooltip(e) {
    if (!tooltipEl) return;
    tooltipEl.style.left = (e.clientX + 12) + 'px';
    tooltipEl.style.top = (e.clientY + 14) + 'px';
  }

  // ---------- Section: Default Hourly Rates ----------

  function renderRates() {
    const rates = workingCopy.hourlyRates || {};
    const ids = Object.keys(rates);
    return `
      <p class="ae-settings-help">These rates apply to new estimates and to lines you haven't overridden in this estimate.</p>
      <div class="ae-settings-table">
        <div class="ae-settings-table-row ae-settings-table-head">
          <span>Line</span><span>$ / hr</span>
        </div>
        ${ids.map((id) => `
          <div class="ae-settings-table-row">
            <span class="ae-settings-row-label">${escapeHtml(id)}</span>
            <input type="number" class="ae-settings-input" data-rate-id="${id}" min="0" step="1" value="${rates[id] || 0}">
          </div>
        `).join('')}
      </div>
    `;
  }

  function bindRates() {
    modalEl.querySelectorAll('[data-rate-id]').forEach((el) => {
      el.addEventListener('change', () => {
        const v = parseFloat(el.value);
        workingCopy.hourlyRates[el.dataset.rateId] = isFinite(v) ? v : 0;
      });
    });
  }

  // ---------- Section: Build Grades ----------
  //
  // The user only sets the Builder Grade conditioned base $/sf. All other
  // grade rates derive via hardcoded ratios + markup stack (see
  // aeConfig.deriveBuildGrades). Regional adjustment lives on the estimate
  // side as a per-project input, not here.

  function renderGrades() {
    const builderBase = workingCopy.builderBaseConditionedSf;
    const grades = window.aeConfig.deriveBuildGrades(builderBase);
    const labels = window.aeConfig.BUILD_GRADE_LABELS;
    return `
      <p class="ae-settings-help">
        Set the <strong>Builder Grade conditioned base $/sf</strong>. This is an RSMeans-style Economy hard cost — labor + materials only, national average, excluding GC overhead and profit. Every other grade and the unconditioned area rates derive from this single value via fixed ratios and a markup stack.
      </p>
      <div class="ae-settings-table">
        <div class="ae-settings-table-row ae-ss-row">
          <span class="ae-settings-row-label">Builder Grade conditioned base $/sf</span>
          <input type="number" class="ae-settings-input" id="aeBuilderBase" min="1" step="1" value="${builderBase}">
          <span class="ae-settings-help-inline">national avg, hard cost only</span>
        </div>
      </div>
      <h4 style="margin-top:1rem;">Derived rates (read-only)</h4>
      <p class="ae-settings-help" style="margin-bottom:0.5rem;">
        For each grade: base = builder base × ratio; cond $/sf = base × markup; uncond $/sf = cond × ${window.aeConfig.UNCONDITIONED_RATIO}.
      </p>
      <div class="ae-settings-table" id="aeGradesPreview">
        ${renderGradesPreviewBody(grades, labels)}
      </div>
    `;
  }

  function renderGradesPreviewBody(grades, labels) {
    return `
      <div class="ae-settings-table-row ae-grade-preview-row ae-settings-table-head">
        <span>Grade</span><span>Ratio</span><span>Markup</span><span>Cond $/sf</span><span>Uncond $/sf</span>
      </div>
      ${window.aeConfig.BUILD_GRADE_KEYS.map((k) => {
        const r = grades[k];
        return `
          <div class="ae-settings-table-row ae-grade-preview-row">
            <span class="ae-settings-row-label">${escapeHtml(labels[k] || k)}</span>
            <span>${r.ratio.toFixed(2)}×</span>
            <span>${r.markup.toFixed(2)}×</span>
            <span>$${Math.round(r.conditioned).toLocaleString()}</span>
            <span>$${Math.round(r.unconditioned).toLocaleString()}</span>
          </div>
        `;
      }).join('')}
    `;
  }

  function bindGrades() {
    const el = document.getElementById('aeBuilderBase');
    if (!el) return;
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      workingCopy.builderBaseConditionedSf = isFinite(v) && v > 0 ? v : 140;
      const grades = window.aeConfig.deriveBuildGrades(workingCopy.builderBaseConditionedSf);
      const preview = document.getElementById('aeGradesPreview');
      if (preview) preview.innerHTML = renderGradesPreviewBody(grades, window.aeConfig.BUILD_GRADE_LABELS);
    });
  }

  // ---------- Section: Structural Multipliers ----------

  function renderStructMult() {
    const m = workingCopy.structuralMultipliers;
    const labels = workingCopy.structuralComplexityLabels || { low: 'Low', medium: 'Medium', high: 'High' };
    const row = (stage, key, val) => {
      const locked = key === 'medium';
      return `
        <div class="ae-settings-table-row ae-mult-row">
          <span class="ae-settings-row-label">${escapeHtml(labels[key] || key)}</span>
          ${locked
            ? `<input type="number" class="ae-settings-input ae-locked-input" value="1.000" disabled> <span class="ae-locked-tag">locked</span>`
            : `<input type="number" class="ae-settings-input" data-struct-mult="${stage}.${key}" step="0.05" min="0" value="${val}">`}
        </div>`;
    };
    const stageTable = (stage, title) => `
      <div>
        <h4>${escapeHtml(title)}</h4>
        <div class="ae-settings-table">
          <div class="ae-settings-table-row ae-mult-row ae-settings-table-head"><span>Complexity</span><span>Multiplier</span></div>
          ${['low', 'medium', 'high'].map((k) => row(stage, k, m[stage][k])).join('')}
        </div>
      </div>`;
    return `
      <p class="ae-settings-help">Per-complexity multipliers. Stage 1 scales construction cost; Stage 2 scales the firm's structural fee.</p>
      <div class="ae-mult-grid">
        ${stageTable('stage1', 'Stage 1 (cost)')}
        ${stageTable('stage2', 'Stage 2 (fee)')}
      </div>
    `;
  }

  function bindStructMult() {
    modalEl.querySelectorAll('[data-struct-mult]').forEach((el) => {
      el.addEventListener('change', () => {
        const [stage, key] = el.dataset.structMult.split('.');
        const v = parseFloat(el.value);
        workingCopy.structuralMultipliers[stage][key] = isFinite(v) ? v : 0;
      });
    });
  }

  // ---------- Section: Size Curve ----------

  function renderSizeCurve() {
    const c = workingCopy.sizeCurve;
    return `
      <p class="ae-settings-help">U-shaped size curve. Small side steepens via progress<sup>1.5</sup>; large side is linear. Standard anchor multiplier is locked at 1.0.</p>
      ${renderCurveAnchorEditor('size', c, 'sf')}
      <div class="ae-curve-plot-wrap">
        ${renderCurveSvg('size')}
        <div class="ae-curve-test">
          <label>Test value (sf): <input type="number" class="ae-settings-input" id="aeSizeCurveTest" min="0" step="100" value="${c.standard.position}"></label>
          <span class="ae-curve-test-result" id="aeSizeCurveResult">→ 1.000</span>
        </div>
      </div>
    `;
  }

  function bindSizeCurve() {
    bindCurveAnchorEditor('size', () => workingCopy.sizeCurve, () => {
      drawCurve('size');
      updateCurveTest('size');
    });
    bindCurveTest('size');
    drawCurve('size');
    updateCurveTest('size');
  }

  // ---------- Section: Density Curves ----------

  function renderDensityCurves() {
    const cc = workingCopy.conditionedDensityCurve;
    const uc = workingCopy.unconditionedDensityCurve;
    return `
      <p class="ae-settings-help">Per-area-type density curves. Density = spaces ÷ sf × 1000. Standard anchors locked at 1.0; linear on each side.</p>
      <h4>Conditioned density</h4>
      ${renderCurveAnchorEditor('cond', cc, 'rooms / 1000 sf')}
      <div class="ae-curve-plot-wrap">
        ${renderCurveSvg('cond')}
        <div class="ae-curve-test">
          <label>Test (rooms/1000sf): <input type="number" class="ae-settings-input" id="aeCondCurveTest" min="0" step="0.1" value="${cc.standard.position}"></label>
          <span class="ae-curve-test-result" id="aeCondCurveResult">→ 1.000</span>
        </div>
      </div>
      <h4 style="margin-top:1.5rem;">Unconditioned density</h4>
      ${renderCurveAnchorEditor('uncond', uc, 'rooms / 1000 sf')}
      <div class="ae-curve-plot-wrap">
        ${renderCurveSvg('uncond')}
        <div class="ae-curve-test">
          <label>Test (rooms/1000sf): <input type="number" class="ae-settings-input" id="aeUncondCurveTest" min="0" step="0.1" value="${uc.standard.position}"></label>
          <span class="ae-curve-test-result" id="aeUncondCurveResult">→ 1.000</span>
        </div>
      </div>
    `;
  }

  function bindDensityCurves() {
    bindCurveAnchorEditor('cond', () => workingCopy.conditionedDensityCurve, () => {
      drawCurve('cond'); updateCurveTest('cond');
    });
    bindCurveAnchorEditor('uncond', () => workingCopy.unconditionedDensityCurve, () => {
      drawCurve('uncond'); updateCurveTest('uncond');
    });
    bindCurveTest('cond');
    bindCurveTest('uncond');
    drawCurve('cond'); updateCurveTest('cond');
    drawCurve('uncond'); updateCurveTest('uncond');
  }

  // ---------- Curve helpers (shared) ----------

  function getCurve(kind) {
    if (kind === 'size')   return workingCopy.sizeCurve;
    if (kind === 'cond')   return workingCopy.conditionedDensityCurve;
    if (kind === 'uncond') return workingCopy.unconditionedDensityCurve;
    return null;
  }

  function curveAnchorKeys(kind) {
    if (kind === 'size') return ['small', 'standard', 'large'];
    return ['sparse', 'standard', 'dense'];
  }

  function curveAnchorLabel(kind, key) {
    if (kind === 'size') {
      return { small: 'Small', standard: 'Standard', large: 'Large' }[key];
    }
    return { sparse: 'Sparse', standard: 'Standard', dense: 'Dense' }[key];
  }

  function curveMultiplierFn(kind) {
    if (kind === 'size') return window.aeConfig.sizeCurveMultiplier;
    return window.aeConfig.densityCurveMultiplier;
  }

  function renderCurveAnchorEditor(kind, c, posUnit) {
    const keys = curveAnchorKeys(kind);
    return `
      <div class="ae-settings-table">
        <div class="ae-settings-table-row ae-anchor-row ae-settings-table-head">
          <span>Anchor</span>
          <span>Position (${escapeHtml(posUnit)})</span>
          <span>Multiplier</span>
        </div>
        ${keys.map((key) => {
          const a = c[key];
          const stdLocked = key === 'standard';
          return `
            <div class="ae-settings-table-row ae-anchor-row">
              <span class="ae-settings-row-label">${escapeHtml(curveAnchorLabel(kind, key))}</span>
              <input type="number" class="ae-settings-input" data-anchor="${kind}.${key}.position" step="${kind === 'size' ? '50' : '0.1'}" min="0" value="${a.position}">
              ${stdLocked
                ? `<input type="number" class="ae-settings-input ae-locked-input" value="1.000" disabled> <span class="ae-locked-tag">locked</span>`
                : `<input type="number" class="ae-settings-input" data-anchor="${kind}.${key}.multiplier" step="0.05" min="0" value="${a.multiplier}">`}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function bindCurveAnchorEditor(kind, getCurveFn, redraw) {
    modalEl.querySelectorAll(`[data-anchor^="${kind}."]`).forEach((el) => {
      el.addEventListener('change', () => {
        const [, key, field] = el.dataset.anchor.split('.');
        const v = parseFloat(el.value);
        if (!isFinite(v) || v < 0) return;
        getCurveFn()[key][field] = v;
        redraw();
      });
    });
  }

  function renderCurveSvg(kind) {
    return `<svg class="ae-curve-svg" id="aeCurveSvg_${kind}" width="100%" height="170" viewBox="0 0 360 170" preserveAspectRatio="none"></svg>`;
  }

  function drawCurve(kind) {
    const svg = document.getElementById('aeCurveSvg_' + kind);
    if (!svg) return;
    const c = getCurve(kind);
    const fn = curveMultiplierFn(kind);
    const keys = curveAnchorKeys(kind);

    const W = 360, H = 170;
    const PADL = 36, PADR = 12, PADT = 12, PADB = 26;
    const plotW = W - PADL - PADR;
    const plotH = H - PADT - PADB;

    // X domain: zero through ~30% past the large/dense anchor so the
    // extrapolation past the outer anchor is visible in the plot.
    const maxPos = Math.max(c[keys[0]].position, c[keys[1]].position, c[keys[2]].position);
    const xMax = maxPos * 1.3;

    // Sample
    const samples = 120;
    const vals = [];
    for (let i = 0; i <= samples; i++) {
      const x = (xMax * i) / samples;
      const y = fn(x, c);
      vals.push({ x, y });
    }

    // Y domain: data-driven with padding, but always include 1.0 so the
    // reference line stays meaningful.
    const ySamples = vals.map((v) => v.y);
    const dataMin = Math.min.apply(null, ySamples);
    const dataMax = Math.max.apply(null, ySamples);
    const range = Math.max(dataMax - dataMin, 0.1);
    const yPad = range * 0.12;
    const yMin = Math.min(1.0 - 0.02, dataMin - yPad);
    const yMax = Math.max(1.0 + 0.02, dataMax + yPad);

    const sx = (x) => PADL + (x / xMax) * plotW;
    const sy = (y) => PADT + (1 - (y - yMin) / (yMax - yMin)) * plotH;

    const path = vals.map((v, i) => (i === 0 ? 'M' : 'L') + sx(v.x).toFixed(1) + ',' + sy(v.y).toFixed(1)).join(' ');
    const oneY = sy(1.0);

    const anchors = keys.map((k) => ({ key: k, label: curveAnchorLabel(kind, k), x: c[k].position, y: c[k].multiplier }));

    // Build SVG content
    let svgContent = '';
    // 1.0 reference line
    svgContent += `<line x1="${PADL}" y1="${oneY.toFixed(1)}" x2="${W - PADR}" y2="${oneY.toFixed(1)}" stroke="#cbd5e1" stroke-dasharray="3,3"/>`;
    // Y-axis ticks at min, 1.0, max
    const yTicks = [yMin, 1.0, yMax];
    svgContent += yTicks.map((t) => `<text x="${PADL - 6}" y="${(sy(t) + 4).toFixed(1)}" text-anchor="end" class="ae-curve-tick">${t.toFixed(2)}</text>`).join('');
    // X-axis ticks at 0, mid, max
    const xTicks = [0, xMax / 2, xMax];
    svgContent += xTicks.map((t) => `<text x="${sx(t).toFixed(1)}" y="${(H - 8).toFixed(1)}" text-anchor="middle" class="ae-curve-tick">${kind === 'size' ? Math.round(t).toLocaleString() : t.toFixed(1)}</text>`).join('');
    // Axes
    svgContent += `<line x1="${PADL}" y1="${PADT}" x2="${PADL}" y2="${H - PADB}" stroke="#94a3b8"/>`;
    svgContent += `<line x1="${PADL}" y1="${H - PADB}" x2="${W - PADR}" y2="${H - PADB}" stroke="#94a3b8"/>`;
    // Curve
    svgContent += `<path d="${path}" fill="none" stroke="#1e293b" stroke-width="1.75"/>`;
    // Hover guide (initially hidden)
    svgContent += `<line class="ae-curve-guide" id="aeCurveGuide_${kind}" x1="0" y1="${PADT}" x2="0" y2="${H - PADB}" stroke="#3b82f6" stroke-width="1" style="display:none"/>`;
    // Anchors
    anchors.forEach((a) => {
      svgContent += `<circle class="ae-curve-anchor" cx="${sx(a.x).toFixed(1)}" cy="${sy(a.y).toFixed(1)}" r="4" fill="#1e293b" stroke="#fff" stroke-width="1.5" data-anchor-info="${escapeAttr(a.label + ': ' + (kind === 'size' ? Math.round(a.x).toLocaleString() + ' sf' : a.x.toFixed(1) + ' rooms/1000sf') + ' → ' + a.y.toFixed(3) + '×')}"/>`;
    });
    // Hover overlay (transparent, captures mouse)
    svgContent += `<rect class="ae-curve-hover" id="aeCurveHover_${kind}" x="${PADL}" y="${PADT}" width="${plotW}" height="${plotH}" fill="transparent"/>`;

    svg.innerHTML = svgContent;

    // Hover handler (uses tooltipEl)
    const hover = document.getElementById('aeCurveHover_' + kind);
    const guide = document.getElementById('aeCurveGuide_' + kind);
    if (hover) {
      hover.addEventListener('mousemove', (e) => {
        const r = svg.getBoundingClientRect();
        // Map clientX to the SVG's user space (account for viewBox scaling)
        const px = ((e.clientX - r.left) / r.width) * W;
        if (px < PADL || px > W - PADR) return;
        const xVal = ((px - PADL) / plotW) * xMax;
        const yVal = fn(xVal, c);
        guide.setAttribute('x1', px.toFixed(1));
        guide.setAttribute('x2', px.toFixed(1));
        guide.style.display = '';
        if (!tooltipEl) bindWarningTooltips();
        const xLabel = kind === 'size'
          ? Math.round(xVal).toLocaleString() + ' sf'
          : xVal.toFixed(2) + ' rooms/1000sf';
        tooltipEl.textContent = xLabel + ' → ' + yVal.toFixed(3) + '×';
        tooltipEl.style.display = 'block';
        positionTooltip(e);
      });
      hover.addEventListener('mouseleave', () => {
        guide.style.display = 'none';
        if (tooltipEl) tooltipEl.style.display = 'none';
      });
    }

    // Anchor dot tooltips
    svg.querySelectorAll('[data-anchor-info]').forEach((dot) => {
      dot.addEventListener('mouseenter', (e) => {
        if (!tooltipEl) bindWarningTooltips();
        tooltipEl.textContent = dot.getAttribute('data-anchor-info');
        tooltipEl.style.display = 'block';
        positionTooltip(e);
      });
      dot.addEventListener('mousemove', positionTooltip);
      dot.addEventListener('mouseleave', () => { if (tooltipEl) tooltipEl.style.display = 'none'; });
    });
  }

  function bindCurveTest(kind) {
    const inputId = kind === 'size' ? 'aeSizeCurveTest' : (kind === 'cond' ? 'aeCondCurveTest' : 'aeUncondCurveTest');
    const el = document.getElementById(inputId);
    if (!el) return;
    el.addEventListener('input', () => updateCurveTest(kind));
  }

  function updateCurveTest(kind) {
    const inputId = kind === 'size' ? 'aeSizeCurveTest' : (kind === 'cond' ? 'aeCondCurveTest' : 'aeUncondCurveTest');
    const resultId = kind === 'size' ? 'aeSizeCurveResult' : (kind === 'cond' ? 'aeCondCurveResult' : 'aeUncondCurveResult');
    const el = document.getElementById(inputId);
    const out = document.getElementById(resultId);
    if (!el || !out) return;
    const v = parseFloat(el.value);
    const c = getCurve(kind);
    const fn = curveMultiplierFn(kind);
    const m = isFinite(v) ? fn(v, c) : 1.0;
    out.textContent = '→ ' + m.toFixed(3) + '×';
  }

  // ---------- Section: Phase Weights ----------

  function renderPhaseWeights() {
    const w = workingCopy.phaseWeights;
    const keys = ['feasibilityConcept', 'schematicDesign', 'designDevelopment', 'constructionDocuments', 'biddingNegotiation', 'constructionAdministration'];
    const labels = {
      feasibilityConcept: 'Feasibility / Concept',
      schematicDesign: 'Schematic Design',
      designDevelopment: 'Design Development',
      constructionDocuments: 'Construction Documents',
      biddingNegotiation: 'Bidding / Negotiation',
      constructionAdministration: 'Construction Administration',
    };
    const sum = keys.reduce((s, k) => s + (w[k] || 0), 0);
    return `
      <p class="ae-settings-help">Distribution weights. The 5 post-concept phases sum to 1.00; Feasibility/Concept adds 0.15 on top, for a typical total of 1.15.</p>
      <div class="ae-settings-table">
        <div class="ae-settings-table-row ae-pw-row ae-settings-table-head"><span>Phase</span><span>Weight</span></div>
        ${keys.map((k) => `
          <div class="ae-settings-table-row ae-pw-row">
            <span class="ae-settings-row-label">${escapeHtml(labels[k])}</span>
            <input type="number" class="ae-settings-input" data-phase-wt="${k}" step="0.01" min="0" value="${w[k]}">
          </div>
        `).join('')}
        <div class="ae-settings-table-row ae-pw-row ae-sum-row">
          <span class="ae-settings-row-label">Sum</span>
          <span class="ae-sum-value">${sum.toFixed(3)}</span>
        </div>
      </div>
    `;
  }

  function bindPhaseWeights() {
    modalEl.querySelectorAll('[data-phase-wt]').forEach((el) => {
      el.addEventListener('change', () => {
        const v = parseFloat(el.value);
        workingCopy.phaseWeights[el.dataset.phaseWt] = isFinite(v) ? v : 0;
        renderSectionBody();
      });
    });
  }

  // ---------- Section: CD Sub-Level Split ----------

  function renderCdSplit() {
    return renderSplitTrio('CD Sub-Level Split', 'cdSubLevelSplit', 'data-cd-split', 'How the CD dollar bucket divides among the three sub-deliverables. Sums to 1.00.');
  }

  function bindCdSplit() {
    bindSplitTrio('data-cd-split', 'cdSubLevelSplit');
  }

  // ---------- Section: DD CD Split ----------

  function renderDdSplit() {
    return renderSplitTrio('DD CD Split', 'designDevelopmentCdSplit', 'data-dd-split', 'How much of Design Development each CD sub-level "anchors". Excluding a sub-level subtracts that fraction of DD. Sums to 1.00.');
  }

  function bindDdSplit() {
    bindSplitTrio('data-dd-split', 'designDevelopmentCdSplit');
  }

  // ---------- Section: CA CD Split ----------

  function renderCaSplit() {
    return renderSplitTrio('CA CD Split', 'constructionAdministrationCdSplit', 'data-ca-split', 'How much of Construction Administration each CD sub-level "anchors". Applies to both Design CA and Structural CA. Default 0 / 0.5 / 0.5: excluding Construction Set halves CA; also excluding Bid Set zeros CA. Sums to 1.00.');
  }

  function bindCaSplit() {
    bindSplitTrio('data-ca-split', 'constructionAdministrationCdSplit');
  }

  function renderSplitTrio(title, key, dataAttr, helpText) {
    const s = workingCopy[key];
    const labels = { permitSet: 'Permit Set', bidSet: 'Bid Set', constructionSet: 'Construction Set' };
    const sum = (s.permitSet || 0) + (s.bidSet || 0) + (s.constructionSet || 0);
    const sumOk = Math.abs(sum - 1.0) < 0.0005;
    return `
      <p class="ae-settings-help">${helpText}</p>
      <div class="ae-settings-table">
        <div class="ae-settings-table-row ae-pw-row ae-settings-table-head"><span>Sub-level</span><span>Share</span></div>
        ${['permitSet', 'bidSet', 'constructionSet'].map((k) => `
          <div class="ae-settings-table-row ae-pw-row">
            <span class="ae-settings-row-label">${escapeHtml(labels[k])}</span>
            <input type="number" class="ae-settings-input" ${dataAttr}="${k}" step="0.01" min="0" value="${s[k]}">
          </div>
        `).join('')}
        <div class="ae-settings-table-row ae-pw-row ae-sum-row">
          <span class="ae-settings-row-label">Sum</span>
          <span class="ae-sum-value">${sum.toFixed(3)} ${sumOk ? '' : warnBadge(title + ' sums to ' + sum.toFixed(3) + ', expected 1.000')}</span>
        </div>
      </div>
    `;
  }

  function bindSplitTrio(dataAttr, key) {
    const attrName = dataAttr.replace(/^data-/, '');
    const camel = attrName.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    modalEl.querySelectorAll('[' + dataAttr + ']').forEach((el) => {
      el.addEventListener('change', () => {
        const v = parseFloat(el.value);
        const subKey = el.dataset[camel];
        workingCopy[key][subKey] = isFinite(v) ? v : 0;
        renderSectionBody();
      });
    });
  }

  // ---------- Section: Structural Settings ----------

  function renderStructSet() {
    const s = workingCopy.structuralSettings;
    const portionSum = (s.designPortion || 0) + (s.caPortion || 0);
    const portionOk = Math.abs(portionSum - 1.0) < 0.0005;
    return `
      <p class="ae-settings-help">Total structural fee = construction cost × <em>share</em> × <em>totalRate</em> × stage-2 complexity multiplier. The fee then splits into a design portion (Structural Engineering line) and a CA portion (Structural CA line).</p>
      <div class="ae-settings-table">
        <div class="ae-settings-table-row ae-ss-row">
          <span class="ae-settings-row-label">Share of construction</span>
          <input type="number" class="ae-settings-input" data-ss="share" step="0.01" min="0" max="1" value="${s.share}">
        </div>
        <div class="ae-settings-table-row ae-ss-row">
          <span class="ae-settings-row-label">Total rate (fraction of structural work)</span>
          <input type="number" class="ae-settings-input" data-ss="totalRate" step="0.0005" min="0" value="${s.totalRate}">
        </div>
        <div class="ae-settings-table-row ae-ss-row">
          <span class="ae-settings-row-label">Design portion (SE line)</span>
          <input type="number" class="ae-settings-input" data-ss="designPortion" step="0.05" min="0" max="1" value="${s.designPortion}">
        </div>
        <div class="ae-settings-table-row ae-ss-row">
          <span class="ae-settings-row-label">CA portion (Structural CA line)</span>
          <input type="number" class="ae-settings-input" data-ss="caPortion" step="0.05" min="0" max="1" value="${s.caPortion}">
        </div>
        <div class="ae-settings-table-row ae-ss-row ae-sum-row">
          <span class="ae-settings-row-label">Design + CA</span>
          <span class="ae-sum-value">${portionSum.toFixed(3)} ${portionOk ? '' : warnBadge('Design + CA portions sum to ' + portionSum.toFixed(3) + ', expected 1.000')}</span>
        </div>
      </div>
    `;
  }

  function bindStructSet() {
    modalEl.querySelectorAll('[data-ss]').forEach((el) => {
      el.addEventListener('change', () => {
        const v = parseFloat(el.value);
        workingCopy.structuralSettings[el.dataset.ss] = isFinite(v) ? v : 0;
        renderSectionBody();
      });
    });
  }

  // ---------- Section: Architect Minimum Fee ----------

  function renderMinFee() {
    const v = workingCopy.architectMinimumFee != null ? workingCopy.architectMinimumFee : 0;
    return `
      <p class="ae-settings-help">
        If the fee schedule produces an architect base fee below this amount,
        the base is bumped up to this floor before phase distribution. Excluded
        phases (e.g., permit-only scopes) still drop out on top — this is a
        floor on the base, not on the sum of included lines. Set to 0 to disable.
      </p>
      <div class="ae-settings-table">
        <div class="ae-settings-table-row ae-ss-row">
          <span class="ae-settings-row-label">Minimum architect fee ($)</span>
          <input type="number" class="ae-settings-input" id="aeArchMinFee" step="500" min="0" value="${v}">
          <span class="ae-settings-help-inline">default $10,000</span>
        </div>
      </div>
    `;
  }

  function bindMinFee() {
    const el = document.getElementById('aeArchMinFee');
    if (!el) return;
    el.addEventListener('change', () => {
      const v = parseFloat(el.value);
      workingCopy.architectMinimumFee = isFinite(v) && v >= 0 ? v : 0;
      renderSectionBody();
    });
  }

  // ---------- Section: City Comments % of Permit Set ----------

  function renderCity() {
    const v = workingCopy.cityCommentsPctOfPermitSet;
    return `
      <p class="ae-settings-help">City Comment Revisions allowance is computed as a fraction of the (post-flag) Permit Set value.</p>
      <div class="ae-settings-table">
        <div class="ae-settings-table-row ae-ss-row">
          <span class="ae-settings-row-label">City comments % of Permit Set</span>
          <input type="number" class="ae-settings-input" id="aeCityBase" step="0.01" min="0" max="2" value="${v}">
          <span class="ae-settings-help-inline">${(v * 100).toFixed(1)}%</span>
        </div>
      </div>
    `;
  }

  function bindCity() {
    const el = document.getElementById('aeCityBase');
    if (!el) return;
    el.addEventListener('change', () => {
      const v = parseFloat(el.value);
      workingCopy.cityCommentsPctOfPermitSet = isFinite(v) ? v : 0;
      renderSectionBody();
    });
  }

  // ---------- Section: Regulatory Flags ----------

  function renderFlags() {
    const flags = workingCopy.regulatoryFlags || [];
    const baseFactor = workingCopy.permitSetBaseFactor;
    return `
      <p class="ae-settings-help">
        Permit Set value = base × (<strong>base factor</strong> + Σ active flag adders).
        With no flags active, the permit set is reduced by the base factor; each active flag adds work back.
      </p>
      <div class="ae-settings-table">
        <div class="ae-settings-table-row ae-ss-row">
          <span class="ae-settings-row-label">Permit Set base factor</span>
          <input type="number" class="ae-settings-input" id="aePermitSetBaseFactor" step="0.05" min="0" value="${baseFactor}">
          <span class="ae-settings-help-inline">no-flags multiplier</span>
        </div>
      </div>
      <div class="ae-section-header-row">
        <h4 style="margin-top:1rem;">Regulatory flags</h4>
        <button class="btn btn-small" id="aeFlagsLoadShipped" title="Replace just the flag list with the shipped defaults">Load shipped flags</button>
      </div>
      <div class="ae-settings-table">
        <div class="ae-settings-table-row ae-flag-row ae-settings-table-head">
          <span>Identifier</span><span>Display label</span><span>Permit adder</span><span></span>
        </div>
        ${flags.map((f, idx) => `
          <div class="ae-settings-table-row ae-flag-row" data-flag-idx="${idx}">
            <input type="text"   class="ae-settings-input" data-flag-field="id"             data-flag-idx="${idx}" value="${escapeAttr(f.id)}">
            <input type="text"   class="ae-settings-input" data-flag-field="label"          data-flag-idx="${idx}" value="${escapeAttr(f.label || '')}">
            <input type="number" class="ae-settings-input" data-flag-field="permitSetAdder" data-flag-idx="${idx}" step="0.05" min="0" value="${f.permitSetAdder || 0}">
            <button class="ae-line-remove" data-flag-remove="${idx}" title="Remove flag">×</button>
          </div>
        `).join('')}
      </div>
      <div class="ae-add-row"><button class="btn btn-small" id="aeFlagAdd">+ Add Flag</button></div>
    `;
  }

  function bindFlags() {
    const baseEl = document.getElementById('aePermitSetBaseFactor');
    if (baseEl) {
      baseEl.addEventListener('change', () => {
        const v = parseFloat(baseEl.value);
        workingCopy.permitSetBaseFactor = isFinite(v) && v >= 0 ? v : 0;
      });
    }
    modalEl.querySelectorAll('[data-flag-field]').forEach((el) => {
      el.addEventListener('change', () => {
        const idx = parseInt(el.dataset.flagIdx);
        const field = el.dataset.flagField;
        const flag = workingCopy.regulatoryFlags[idx];
        if (!flag) return;
        if (field === 'id' || field === 'label') flag[field] = el.value;
        else { const v = parseFloat(el.value); flag[field] = isFinite(v) ? v : 0; }
      });
    });
    modalEl.querySelectorAll('[data-flag-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.flagRemove);
        workingCopy.regulatoryFlags.splice(idx, 1);
        renderSectionBody();
      });
    });
    const add = document.getElementById('aeFlagAdd');
    if (add) {
      add.addEventListener('click', () => {
        workingCopy.regulatoryFlags.push({ id: 'new_flag_' + Math.random().toString(36).slice(2, 6), label: 'New Flag', permitSetAdder: 0 });
        renderSectionBody();
      });
    }
    const loadShipped = document.getElementById('aeFlagsLoadShipped');
    if (loadShipped) {
      loadShipped.addEventListener('click', () => {
        if (!confirm('Replace the flag list with the shipped defaults? Your other settings (rates, curves, factors) are unaffected.')) return;
        workingCopy.regulatoryFlags = window.aeConfig.deepClone(window.aeConfig.DEFAULT_CONFIG.regulatoryFlags);
        renderSectionBody();
      });
    }
  }

  // ---------- Section: Settings Backups ----------
  //
  // Every time Save as Default writes to localStorage, the prior config
  // gets snapshotted into aeConfigBackups (last 20 auto-rotated). This
  // section lists those backups and lets you load one into the working
  // copy so you can recover from an accidental overwrite.

  function parseBackupEntry(entry) {
    try {
      const parsed = JSON.parse(entry.raw);
      return parsed.config || parsed;
    } catch (e) {
      return null;
    }
  }

  function renderBackups() {
    const backups = (window.aeConfig.loadBackups() || []).slice().reverse(); // most recent first
    if (!backups.length) {
      return `
        <p class="ae-settings-help">
          No backups found in this browser. Backups are created automatically each
          time you click <strong>Save as Default</strong>; the previous saved
          config is rotated into a history of up to 20 entries.
        </p>`;
    }

    const rows = backups.map((entry, idx) => {
      const cfg = parseBackupEntry(entry);
      const ts = entry.timestamp ? new Date(entry.timestamp) : null;
      const when = ts && !isNaN(ts) ? ts.toLocaleString() : (entry.timestamp || 'unknown time');
      const flagCount = cfg && Array.isArray(cfg.regulatoryFlags) ? cfg.regulatoryFlags.length : '—';
      const builderBase = cfg && typeof cfg.builderBaseConditionedSf === 'number' ? `$${cfg.builderBaseConditionedSf}/sf` : '—';
      const minFee = cfg && typeof cfg.architectMinimumFee === 'number' ? `$${cfg.architectMinimumFee.toLocaleString('en-US')}` : '—';
      const curveSm = cfg && cfg.sizeCurve && cfg.sizeCurve.small && cfg.sizeCurve.small.multiplier != null
        ? cfg.sizeCurve.small.multiplier.toFixed(2) : '—';
      return `
        <div class="ae-backup-row" data-backup-idx="${idx}">
          <div class="ae-backup-meta">
            <div class="ae-backup-time"><strong>${escapeHtml(when)}</strong></div>
            <div class="ae-backup-summary">
              ${flagCount} flags · Builder base ${escapeHtml(builderBase)} · Min fee ${escapeHtml(minFee)} · Size curve small ×${escapeHtml(curveSm)}
            </div>
          </div>
          <button class="btn btn-secondary ae-backup-restore" data-backup-idx="${idx}" ${cfg ? '' : 'disabled'}>
            ${cfg ? 'Load into working copy' : 'Corrupt'}
          </button>
        </div>`;
    }).join('');

    return `
      <p class="ae-settings-help">
        Each entry is a snapshot of your saved defaults from before a
        <strong>Save as Default</strong>. Click <strong>Load into working copy</strong>
        to bring a snapshot back into the modal — then click <strong>Save as Default</strong>
        at the bottom to persist it. The modal will not auto-save; you can browse
        other sections after loading to verify before committing.
      </p>
      <div class="ae-backups-list">${rows}</div>`;
  }

  function bindBackups() {
    const backups = (window.aeConfig.loadBackups() || []).slice().reverse();
    document.querySelectorAll('.ae-backup-restore').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.backupIdx);
        const entry = backups[idx];
        if (!entry) return;
        const cfg = parseBackupEntry(entry);
        if (!cfg) { alert('Could not parse this backup.'); return; }
        if (!confirm('Load this backup into the working copy? Your current working copy will be replaced. You will still need to click Save as Default to persist it.')) return;
        workingCopy = window.aeConfig.deepClone(cfg);
        renderSectionBody();
      });
    });
  }

  // ---------- Settings export / import ----------

  async function exportSettings() {
    const json = JSON.stringify({ version: 1, exported: new Date().toISOString(), config: workingCopy }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: 'AE Settings.json',
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
    a.href = url; a.download = 'AE Settings.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importSettings() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          const cfg = parsed.config || parsed;
          if (!cfg || typeof cfg !== 'object' || !cfg.hourlyRates) {
            alert('This does not look like a valid A/E settings file.');
            return;
          }
          workingCopy = window.aeConfig.deepClone(cfg);
          renderSectionBody();
        } catch (e) {
          alert('Could not read settings file: ' + e.message);
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  // ---------- Utilities ----------

  function escapeAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return { open };
})();
