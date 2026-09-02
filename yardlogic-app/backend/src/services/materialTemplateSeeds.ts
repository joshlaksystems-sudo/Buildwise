// Global starter templates (businessId: null) — every business sees
// these by default and can clone/customize them. This is the exact
// table from the build doc, encoded as data instead of four
// hardcoded verticals.

export const STARTER_TEMPLATES = [
  {
    name: "Cement",
    unitOptions: ["Bag (50kg)", "Ton"],
    attributeSchema: [
      { key: "grade", label: "Grade", type: "select", options: ["OPC 43", "OPC 53", "PPC"] },
    ],
    defaultHsnCode: "2523",
    defaultGstRate: 28,
  },
  {
    name: "Steel/Iron",
    unitOptions: ["Bundle", "Ton", "Piece"],
    attributeSchema: [
      { key: "tmtSize", label: "TMT Size (mm)", type: "select", options: ["8", "10", "12", "16", "20", "25", "32"] },
      { key: "steelGrade", label: "Grade", type: "select", options: ["Fe500", "Fe550"] },
    ],
    defaultHsnCode: "7214",
    defaultGstRate: 18,
  },
  {
    name: "Bricks",
    unitOptions: ["Piece (1000s)", "Truckload"],
    attributeSchema: [
      { key: "brickClass", label: "Class", type: "select", options: ["Class A", "Class B"] },
      { key: "sizeVariant", label: "Size", type: "text" },
    ],
    defaultHsnCode: "6901",
    defaultGstRate: 5,
  },
  {
    name: "Sand",
    unitOptions: ["Truckload", "Cubic Ft", "Cubic Meter"],
    attributeSchema: [
      { key: "sandType", label: "Type", type: "select", options: ["River Sand", "M-Sand"] },
      { key: "sandGrade", label: "Grade", type: "text" },
    ],
    defaultHsnCode: "2505",
    defaultGstRate: 5,
  },
];
