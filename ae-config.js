// A/E Estimate — Configuration defaults and math helpers.
// Phase 2: hardcoded defaults exposed. Phase 3 will add localStorage persistence and editor UI.

window.aeConfig = (function () {
  const STORAGE_KEY = 'aeConfig';
  const BACKUP_KEY = 'aeConfigBackups';
  const MAX_BACKUPS = 20;

  const DEFAULT_CONFIG = {
    hourlyRates: {
      feasibility: 190,
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
    buildGrades: {
      builder:     { conditioned: 280,  unconditioned: 150 },
      mid_custom:  { conditioned: 400,  unconditioned: 210 },
      high_custom: { conditioned: 550,  unconditioned: 290 },
      luxury:      { conditioned: 750,  unconditioned: 400 },
      ultra:       { conditioned: 1100, unconditioned: 600 },
    },
    buildGradeLabels: {
      builder: 'Builder',
      mid_custom: 'Mid Custom',
      high_custom: 'High Custom',
      luxury: 'Luxury',
      ultra: 'Ultra',
    },
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
      factor: 1.0,
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
    cityCommentsBasePct: 0.05,
    regulatoryFlags: [
      { id: 'subchapter_f',        label: 'Subchapter F (McMansion)',   permitSetAdder: 0.15, cityCommentsAdder: 0.40 },
      { id: 'heritage_tree_review', label: 'Heritage Tree Review',      permitSetAdder: 0.10, cityCommentsAdder: 0.50 },
      { id: 'tree_protection_plan', label: 'Tree Protection Plan',      permitSetAdder: 0.10, cityCommentsAdder: 0.20 },
      { id: 'historic_district',    label: 'Historic District',         permitSetAdder: 0.25, cityCommentsAdder: 0.50 },
      { id: 'hillside',             label: 'Hillside (>15% slope)',     permitSetAdder: 0.10, cityCommentsAdder: 0.30 },
      { id: 'floodplain',           label: 'Floodplain',                permitSetAdder: 0.15, cityCommentsAdder: 0.20 },
    ],
  };

  // ---------- Curve math ----------

  // U-shaped size curve. Small side steepens via progress^1.5; large side linear.
  function sizeCurveMultiplier(sf, curve) {
    const small = curve.small.position;
    const std   = curve.standard.position;
    const large = curve.large.position;
    const smallM = curve.small.multiplier;
    const largeM = curve.large.multiplier;

    if (!isFinite(sf) || sf <= 0) return 1.0;
    if (sf <= small) return smallM;
    if (sf >= large) return largeM;
    if (sf <= std) {
      const progress = (std - sf) / (std - small);
      return 1.0 + (smallM - 1.0) * Math.pow(progress, 1.5);
    }
    const progress = (sf - std) / (large - std);
    return 1.0 + (largeM - 1.0) * progress;
  }

  // Linear density curve on each side of standard.
  function densityCurveMultiplier(density, curve) {
    const sparse = curve.sparse.position;
    const std    = curve.standard.position;
    const dense  = curve.dense.position;
    const sparseM = curve.sparse.multiplier;
    const denseM  = curve.dense.multiplier;

    if (!isFinite(density) || density <= 0) return sparseM;
    if (density <= sparse) return sparseM;
    if (density >= dense) return denseM;
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
    deepClone,
  };
})();
