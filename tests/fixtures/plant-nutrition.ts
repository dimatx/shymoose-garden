// Acceptance examples: authored plant facts, not output from the projector.
export const nutritionExamples = {
  "mountain-laurel": {
    fertilizer: { kind: "applications", applications: [{
      treatmentId: "acid-loving-feed",
      use: "Espoma Holly-tone",
      when: "Late winter to early spring",
      condition: "Only if a soil test confirms a nutrient shortage.",
      notes: [],
    }] },
    mulch: [],
  },
  "pinus-strobus-angel-falls": {
    fertilizer: { kind: "applications", applications: [{
      treatmentId: "acid-loving-feed",
      use: "Espoma Holly-tone",
      when: "Late winter to early spring",
      condition: "Only if a soil test confirms a nutrient shortage.",
      notes: [],
    }] },
    mulch: [],
  },
  "karen-azelia": {
    fertilizer: { kind: "applications", applications: [{
      treatmentId: "acid-loving-feed",
      use: "Espoma Holly-tone",
      when: "At the first hint of bloom color",
      condition: "Only if a soil test confirms a nutrient shortage.",
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
      use: "Leaf mould or finished garden compost",
      when: "Spring, on moist soil",
      notes: [],
    }],
  },
  "solanum-lycopersicum-carbon": {
    fertilizer: { kind: "applications", applications: [{
      treatmentId: "vegetable-bed-nutrition",
      use: "Soil-test-matched vegetable fertilizer",
      when: "Before planting into warm soil",
      condition: "Only if a soil test confirms a nutrient shortage.",
      notes: [],
    }, {
      treatmentId: "tomato-fruit-feed",
      use: "Soil-test-matched vegetable fertilizer",
      when: "When the first fruits enlarge",
      condition: "Only if additional nutrients are needed.",
      notes: [],
    }] },
    mulch: [],
  },
  parsley: { mulch: [] },
} as const;
