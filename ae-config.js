// A/E Estimate — Configuration defaults and math helpers.
// Phase 2: hardcoded defaults exposed. Phase 3 will add localStorage persistence and editor UI.

window.aeConfig = (function () {
  const STORAGE_KEY = 'aeConfig';
  const BACKUP_KEY = 'aeConfigBackups';
  const PROGRAM_DEFAULTS_KEY = 'aeProgramDefaults';
  const MAX_BACKUPS = 20;

  const DEFAULT_CONFIG = {
    hourlyRates: {
      site_visit: 190,
      scan: 130,
      base_model: 130,
      as_builts: 130,
      feasibility_concept: 190,
      schematic_design: 142,
      design_development: 142,
      permit_set: 142,
      bid_set: 142,
      construction_set: 142,
      structural_engineering: 160,
      bidding_negotiation: 190,
      permit_submittals: 160,
      city_comment_revisions: 160,
      design_ca: 160,
      structural_ca: 190,
      additional_services_default: 142,
    },
    // The user only sets the Builder Grade conditioned base $/sf.
    // All other grade rates derive via hardcoded ratios + markup stack
    // (see deriveBuildGrades below). Represents an RSMeans-style Economy
    // hard cost (labor + materials only, national average, excluding GC
    // overhead and profit).
    builderBaseConditionedSf: 200,
    structuralComplexityLabels: { low: 'Low', medium: 'Medium', high: 'High' },
    structuralMultipliers: {
      stage1: { low: 0.75, medium: 1.0, high: 1.25 },
      stage2: { low: 0.80, medium: 1.0, high: 1.30 },
    },
    sizeCurve: {
      small:    { position: 500,   multiplier: 1.60 },
      standard: { position: 3000,  multiplier: 1.00 },  // locked
      large:    { position: 12000, multiplier: 1.05 },
    },
    conditionedDensityCurve: {
      sparse:   { position: 1.0, multiplier: 0.85 },
      standard: { position: 4.0, multiplier: 1.00 },  // locked
      dense:    { position: 8.0, multiplier: 1.20 },
    },
    unconditionedDensityCurve: {
      sparse:   { position: 0.5, multiplier: 0.90 },
      standard: { position: 1.5, multiplier: 1.00 },  // locked
      dense:    { position: 4.0, multiplier: 1.15 },
    },
    // Fee schedule: AIA-style matrix of building category × cost bracket.
    // Each category row's pcts[] aligns with brackets[]. Final fee % =
    //   basePct × projectComplexityFactor × factor (global tunable).
    feeSchedule: {
      factor: 0.5,
      projectComplexityFactors: { simple: 0.85, normal: 1.00, complex: 1.15 },
      projectComplexityLabels:  { simple: 'Simple', normal: 'Normal', complex: 'Complex' },
      brackets: [
        { maxCost: 500000,    label: '<$500K' },
        { maxCost: 1000000,   label: '$500K–<$1M' },
        { maxCost: 2000000,   label: '$1M–<$2M' },
        { maxCost: 5000000,   label: '$2M–<$5M' },
        { maxCost: 10000000,  label: '$5M–<$10M' },
        { maxCost: 25000000,  label: '$10M–<$25M' },
        { maxCost: 50000000,  label: '$25M–<$50M' },
      ],
      categories: {
        '1': { shortLabel: '1 — Warehouses, storage',              description: 'Warehouses, barns, storage buildings, kennels',                                                                                                pcts: [0.0714, 0.0612, 0.0507, 0.0478, 0.0457, 0.0446, 0.0418] },
        '2': { shortLabel: '2 — Multi-unit residential',           description: 'Multiple-unit residential (apartments, condos, dormitories), park buildings',                                                                   pcts: [0.0824, 0.0726, 0.0670, 0.0593, 0.0570, 0.0541, 0.0515] },
        '3': { shortLabel: '3 — Motels, shopping, industrial',     description: 'Motels, shopping centers (shell), senior apartments, kindergartens, industrial buildings, light manufacturing',                                pcts: [0.0872, 0.0793, 0.0696, 0.0628, 0.0599, 0.0578, 0.0549] },
        '4': { shortLabel: '4 — Schools, hotels, civic',           description: 'High schools, hotels, post offices, grandstands, retirement facilities, community centers, parking structures, fire/police stations',           pcts: [0.0945, 0.0840, 0.0749, 0.0693, 0.0670, 0.0683, 0.0609] },
        '5': { shortLabel: '5 — Recreation, restaurants',          description: 'Recreation buildings, university classroom buildings, daycares, restaurants, churches, long-term care, libraries (non-research)',               pcts: [0.1024, 0.0919, 0.0814, 0.0767, 0.0740, 0.0704, 0.0672] },
        '6': { shortLabel: '6 — Research, medical, theaters',      description: 'Research facilities, medical/dental buildings, museums, theaters, courthouses, aquariums, rapid transit stations',                             pcts: [0.1076, 0.0945, 0.0840, 0.0775, 0.0728, 0.0696, 0.0665] },
        '7': { shortLabel: '7 — Custom residences',                description: 'Custom residences, legislative buildings, embassies, commemorative monuments, tenant space planning, mints',                                   pcts: [0.1418, 0.1496, 0.1391, 0.1326, 0.1274, 0.1221, 0.1169] },
      },
    },
    structuralSettings: {
      share: 0.60,         // fraction of construction cost that is structural work
      totalRate: 0.0135,   // engineer's total fee as % of structural work value
      designPortion: 0.80, // Structural Engineering line as fraction of total structural fee
      caPortion: 0.20,     // Structural CA line as fraction of total structural fee
    },
    phaseWeights: {
      feasibilityConcept: 0.15,
      schematicDesign: 0.15,
      designDevelopment: 0.20,
      constructionDocuments: 0.40,
      biddingNegotiation: 0.05,
      constructionAdministration: 0.20,
    },
    cdSubLevelSplit: {
      permitSet: 0.22,
      bidSet: 0.33,
      constructionSet: 0.45,
    },
    // How much of Design Development each CD sub-level "anchors". When a CD
    // sub-level is excluded, that fraction of DD drops out of the calculated
    // DD baseline. Sums to 1.0.
    designDevelopmentCdSplit: {
      permitSet: 0.25,
      bidSet: 0.25,
      constructionSet: 0.50,
    },
    // How much of Construction Administration each CD sub-level "anchors".
    // Applies to both Design CA and Structural CA. With defaults: excluding
    // Construction Set cuts CA in half; also excluding Bid Set drops CA to
    // zero (you don't do CA without bid + construction documents). Sums to 1.0.
    constructionAdministrationCdSplit: {
      permitSet: 0.00,
      bidSet: 0.50,
      constructionSet: 0.50,
    },
    // Minimum architect fee before phase distribution. If the schedule
    // produces an architect base fee below this, it is bumped up to this
    // value (and the phase distribution flows from the bumped number).
    // Excluded phases still drop out — this is a floor on the base, not
    // on the sum of included lines. Tuneable per-project via Settings.
    architectMinimumFee: 10000,
    // Permit Set sizing: permit_set_dollars = base × (permitSetBaseFactor + Σ active permit adders).
    // With no flags active, permit set is reduced to 80% of its CD-split allocation.
    // Each active flag adds work back on top.
    permitSetBaseFactor: 0.8,
    // City Comment Revisions allowance is a fraction of the (post-flag) permit set value.
    cityCommentsPctOfPermitSet: 0.25,
    regulatoryFlags: [
      { id: 'subchapter_f',     label: 'Subchapter F',                permitSetAdder: 0.15 },
      { id: 'protected_trees',  label: 'Protected trees',             permitSetAdder: 0.15 },
      { id: 'historic_district', label: 'Historic district',          permitSetAdder: 0.25 },
      { id: 'hillside',         label: 'Hillside',                    permitSetAdder: 0.10 },
      { id: 'floodplain',       label: 'Floodplain',                  permitSetAdder: 0.15 },
      { id: 'water_quality_overlay', label: 'Water quality overlay',  permitSetAdder: 0.10 },
      { id: 'wildlife_urban_interface', label: 'Wildlife Urban Interface', permitSetAdder: 0.10 },
      { id: 'visitability_plan', label: 'Visitability plan',          permitSetAdder: 0.05 },
    ],
  };

  // ---------- Build grade derivation ----------
  // The user only edits the Builder Grade conditioned base $/sf. Every other
  // grade and area-type value derives from these hardcoded constants.

  const BUILD_GRADE_KEYS = ['builder', 'mid_custom', 'high_custom', 'luxury', 'ultra'];
  const BUILD_GRADE_LABELS = {
    builder: 'Builder',
    mid_custom: 'Mid Custom',
    high_custom: 'High Custom',
    luxury: 'Luxury',
    ultra: 'Ultra',
  };
  const GRADE_RATIOS = {       // applied to builder base to get each grade's base conditioned $/sf
    builder: 1.00, mid_custom: 1.40, high_custom: 1.90, luxury: 2.60, ultra: 3.75,
  };
  const MARKUP_STACK = {       // GC overhead + profit per grade
    builder: 1.17, mid_custom: 1.20, high_custom: 1.23, luxury: 1.25, ultra: 1.28,
  };
  const UNCONDITIONED_RATIO = 0.54;

  function deriveBuildGrades(builderBase) {
    const base = isFinite(builderBase) && builderBase > 0 ? builderBase : 140;
    const out = {};
    BUILD_GRADE_KEYS.forEach((k) => {
      const baseCond = base * GRADE_RATIOS[k];
      const finalCond = baseCond * MARKUP_STACK[k];
      const finalUncond = finalCond * UNCONDITIONED_RATIO;
      out[k] = {
        baseConditioned: baseCond,
        conditioned: finalCond,
        unconditioned: finalUncond,
        ratio: GRADE_RATIOS[k],
        markup: MARKUP_STACK[k],
      };
    });
    return out;
  }

  // ---------- Curve math ----------

  // Size curve. Small side steepens via progress^1.5; large side linear. The
  // curve extrapolates past the small and large anchors using the same
  // formulas (no clamping) so values outside the anchor range stay continuous.
  // Result is floored at SIZE_CURVE_FLOOR to keep extrapolation past a
  // below-1.0 large anchor from running away to absurdly low multipliers.
  const SIZE_CURVE_FLOOR = 0.75;
  function sizeCurveMultiplier(sf, curve) {
    const small = curve.small.position;
    const std   = curve.standard.position;
    const large = curve.large.position;
    const smallM = curve.small.multiplier;
    const largeM = curve.large.multiplier;

    if (!isFinite(sf)) return 1.0;
    let m;
    if (sf <= std) {
      const progress = (std - sf) / (std - small);
      // Negative sf can't actually happen in inputs, but guard the exponent.
      m = 1.0 + (smallM - 1.0) * Math.pow(Math.max(progress, 0), 1.5);
    } else {
      const progress = (sf - std) / (large - std);
      m = 1.0 + (largeM - 1.0) * progress;
    }
    return Math.max(m, SIZE_CURVE_FLOOR);
  }

  // Density curve. Linear on each side of standard, extrapolated past the
  // sparse and dense anchors with the same formula (no clamping).
  function densityCurveMultiplier(density, curve) {
    const sparse = curve.sparse.position;
    const std    = curve.standard.position;
    const dense  = curve.dense.position;
    const sparseM = curve.sparse.multiplier;
    const denseM  = curve.dense.multiplier;

    if (!isFinite(density)) return 1.0;
    if (density <= std) {
      const progress = (std - density) / (std - sparse);
      return 1.0 + (sparseM - 1.0) * progress;
    }
    const progress = (density - std) / (dense - std);
    return 1.0 + (denseM - 1.0) * progress;
  }

  // AIA-style fee percentage lookup: category × cost bracket, scaled by
  // project complexity factor and a global tunable factor.
  // Returns the applied fee percentage (e.g., 0.12 for 12%).
  function feePercent(cost, schedule, categoryKey, complexityKey) {
    if (!schedule || !schedule.categories || !schedule.brackets) return 0;
    const brackets = schedule.brackets;
    let bracketIdx = brackets.findIndex((b) => cost < b.maxCost);
    if (bracketIdx === -1) bracketIdx = brackets.length - 1; // above top bracket: clamp to last
    const catKey = String(categoryKey || '7');
    const category = schedule.categories[catKey] || schedule.categories['7'];
    const basePct = (category && category.pcts && category.pcts[bracketIdx]) || 0;
    const complexityFactor = (schedule.projectComplexityFactors || {})[complexityKey || 'normal'];
    const factor = schedule.factor != null ? schedule.factor : 1.0;
    return basePct * (complexityFactor != null ? complexityFactor : 1.0) * factor;
  }

  // Extract bracket index for display/debug purposes.
  function feeBracketIndex(cost, schedule) {
    if (!schedule || !schedule.brackets) return -1;
    const brackets = schedule.brackets;
    let idx = brackets.findIndex((b) => cost < b.maxCost);
    if (idx === -1) idx = brackets.length - 1;
    return idx;
  }

  // ---------- Persistence ----------

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return deepClone(DEFAULT_CONFIG);
      const parsed = JSON.parse(raw);
      // Accept either a bare config object or a { version, config } envelope.
      return parsed.config || parsed;
    } catch (e) {
      console.warn('Failed to load A/E config, using defaults:', e);
      return deepClone(DEFAULT_CONFIG);
    }
  }

  function saveConfig(cfg) {
    try {
      // Back up prior config first.
      const prior = localStorage.getItem(STORAGE_KEY);
      if (prior) {
        const backups = loadBackups();
        backups.push({ timestamp: new Date().toISOString(), raw: prior });
        while (backups.length > MAX_BACKUPS) backups.shift();
        localStorage.setItem(BACKUP_KEY, JSON.stringify(backups));
      }
      const envelope = { version: 1, config: cfg };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    } catch (e) {
      console.warn('Failed to save A/E config:', e);
    }
  }

  function loadBackups() {
    try {
      const raw = localStorage.getItem(BACKUP_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function resetToDefaults() {
    saveConfig(deepClone(DEFAULT_CONFIG));
  }

  // ---------- Program defaults persistence (estimate-side) ----------

  function loadProgramDefaults() {
    try {
      const raw = localStorage.getItem(PROGRAM_DEFAULTS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to load A/E program defaults:', e);
      return null;
    }
  }

  function saveProgramDefaults(defaults) {
    try {
      localStorage.setItem(PROGRAM_DEFAULTS_KEY, JSON.stringify(defaults));
    } catch (e) {
      console.warn('Failed to save A/E program defaults:', e);
    }
  }

  return {
    DEFAULT_CONFIG,
    sizeCurveMultiplier,
    densityCurveMultiplier,
    feePercent,
    feeBracketIndex,
    loadConfig,
    saveConfig,
    loadBackups,
    resetToDefaults,
    loadProgramDefaults,
    saveProgramDefaults,
    deepClone,
    BUILD_GRADE_KEYS,
    BUILD_GRADE_LABELS,
    GRADE_RATIOS,
    MARKUP_STACK,
    UNCONDITIONED_RATIO,
    SIZE_CURVE_FLOOR,
    deriveBuildGrades,
  };
})();
