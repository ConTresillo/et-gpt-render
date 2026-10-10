import assert from "node:assert/strict";
import { approvedInputText } from "../lib/ai/catalog-continuation.ts";
import { resolvePendingInputs } from "../lib/ai/pending-inputs.ts";
const pending = { formula_id: "wd", schema: { properties: { object_size_mm: {}, sensor_size_mm: {}, focal_length_mm: {} } }, requestedKeys: ["object_size_mm", "sensor_size_mm", "focal_length_mm"], values: {} };
assert.deepEqual(resolvePendingInputs(pending, "100mm , 20mm , 30mm"), { object_size_mm: 100, sensor_size_mm: 20, focal_length_mm: 30 });
assert.deepEqual(resolvePendingInputs(pending, "100mm,20mm"), {});
assert.match(approvedInputText({ input: { args: { focal_length_mm: 30 } } }), /focal length = 30 mm/);
console.log("Structured pending input and catalog continuation checks passed");
