// Acceptance examples: authored plant facts, not output from the projector.
export const nutritionExamples = {
  "mountain-laurel": {
    fertilizer: { kind: "applications", applications: [{
      treatmentId: "acid-loving-feed",
      recommendation: "Use Espoma Holly-tone only when soil is nutrient-deficient.",
      when: "Late winter to early spring",
      notes: [],
    }] },
    mulch: [],
  },
  "pinus-strobus-angel-falls": {
    fertilizer: { kind: "applications", applications: [{
      treatmentId: "acid-loving-feed",
      recommendation: "Use Espoma Holly-tone only when soil is nutrient-deficient.",
      when: "Late winter to early spring",
      notes: [],
    }] },
    mulch: [],
  },
  "karen-azelia": {
    fertilizer: { kind: "applications", applications: [{
      treatmentId: "acid-loving-feed",
      recommendation: "Use Espoma Holly-tone only when soil is nutrient-deficient.",
      when: "At the first hint of bloom color",
      notes: [],
    }] },
    mulch: [],
  },
  boxwood: {
    fertilizer: { kind: "applications", applications: [{
      treatmentId: "boxwood-arborvitae-feed",
      recommendation: "Use Espoma Plant-tone only when soil is nutrient-deficient.",
      when: "Late winter to early spring",
      notes: [],
    }] },
    mulch: [],
  },
  "hydrangea-quercifolia-alice": {
    fertilizer: { kind: "applications", applications: [{
      treatmentId: "hydrangea-feed",
      recommendation: "Use slow-release shrub fertilizer only when soil is nutrient-deficient.",
      when: "As spring growth begins",
      notes: [],
    }] },
    mulch: [],
  },
  "geum-tempo-orange": {
    fertilizer: { kind: "applications", applications: [{
      treatmentId: "perennial-nutrient-shortage",
      recommendation: "Use balanced general-purpose fertilizer only when soil is nutrient-deficient.",
      when: "As spring growth begins",
      notes: [],
    }] },
    mulch: [],
  },
  "anacis-verticillata-zagreb": {
    fertilizer: { kind: "withhold", summary: "No routine fertilizer in lean soil." },
    mulch: [],
  },
  "astilbe-chinensis-visions": {
    fertilizer: { kind: "withhold", summary: "No routine fertilizer in rich, moist soil." },
    mulch: [{
      treatmentId: "organic-perennial-mulch",
      recommendation: "Leaf mould or finished garden compost",
      when: "Spring, on moist soil",
      notes: [],
    }],
  },
  "solanum-lycopersicum-carbon": {
    fertilizer: { kind: "applications", applications: [{
      treatmentId: "vegetable-bed-nutrition",
      recommendation: "Use complete granular vegetable fertilizer only when soil is nutrient-deficient.",
      when: "Before planting into warm soil",
      notes: [],
    }, {
      treatmentId: "tomato-fruit-feed",
      recommendation: "Use nitrogen fertilizer only when additional nitrogen is needed.",
      when: "When the first fruits enlarge",
      notes: [],
    }] },
    mulch: [],
  },
  "cucumis-sativus-shintokiwa": {
    fertilizer: { kind: "applications", applications: [{
      treatmentId: "vegetable-bed-nutrition",
      recommendation: "Use complete granular vegetable fertilizer only when soil is nutrient-deficient.",
      when: "Before planting into warm soil",
      notes: [],
    }] },
    mulch: [],
  },
  parsley: { mulch: [] },
} as const;
