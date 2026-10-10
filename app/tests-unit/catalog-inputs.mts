import assert from "node:assert/strict";
import { catalogInputs, statedCatalogFilters } from "../lib/ai/tools/catalog-inputs";
import { statedInputs } from "../lib/calc";
const columns = ["model_name", "focus_length_mm", "sensor_size_raw", "mount_raw"];
assert.deepEqual(statedCatalogFilters("Focal length = 25 mm", columns), [{ column: "focus_length_mm", op: "=", value: "25" }], "equal-sign notation preserves the focal-length constraint");
assert.equal(statedCatalogFilters("focal length 16 mm\nFocal length = 25 mm", columns)[0].value, "25", "updated customer constraints override earlier turns");
const filters = statedCatalogFilters("Show three C-mount lenses with focal length 16 mm for a 2/3-inch sensor", columns);
assert.deepEqual(filters, [
  { column: "focus_length_mm", op: "=", value: "16" },
  { column: "sensor_size_raw", op: "ILIKE", value: '2/3"' },
  { column: "mount_raw", op: "ILIKE", value: "C-Mount" },
]);
assert.equal(statedCatalogFilters("Calculate focal length for a 100 mm field of view", columns).length, 0, "FOV is not a focal-length filter");
assert.equal(statedCatalogFilters("focal length at least 16 mm", columns).length, 0, "ranges are not converted into equality");
assert.equal(statedCatalogFilters("16 mm focal length CS-mount", []).length, 0, "only actual schema columns are used");
const schema = { properties: { sensor_size_mm: {}, object_size_mm: {}, working_distance_mm: {} } };
assert.deepEqual(statedInputs(["sensor width 8.8 mm, horizontal field of view 100 mm, working distance 300 mm"], schema), { sensor_size_mm: 8.8, object_size_mm: 100, working_distance_mm: 300 });
assert.deepEqual(statedInputs(["2/3-inch sensor, object 100 and distance 300"], schema), {}, "inches and unlabelled values are not invented millimetre inputs");
assert.equal(statedInputs(["working distance 100 mm", "working distance 300 mm"], schema).working_distance_mm, 300, "latest explicit value wins");
console.log("Catalog constraints passed");
let executed: any;
const adapted = catalogInputs({ search_products: { execute: async (input: any) => { executed = input; return { results: [{ rows: [{ model_name: "A", focus_length_mm: 40 }, { model_name: "B", focus_length_mm: 40 }, { model_name: "C", focus_length_mm: 35 }] }] }; } } } as never, {
  request: "Which lens for a 100 mm field of view?", targetFocalLengthMm: 40.4,
  describe: async () => ({ structuredContent: { columns } }),
});
const candidates: any = await adapted.search_products.execute!({ table: "verified_lenses", filters: [{ column: "focus_length_mm", op: "=", value: "40.4" }] }, {} as never);
assert.deepEqual(executed.filters, [{ column: "focus_length_mm", op: "<=", value: "40.4" }]);
assert.deepEqual(executed.sort, { column: "focus_length_mm", direction: "desc" });
assert.deepEqual(candidates.results[0].rows.map((row: any) => row.model_name), ["A", "B"]);

await adapted.search_products.execute!({ table: "verified_lenses", filters: [{ column: "mount_raw", op: "ILIKE", value: "M12" }] }, {} as never);
assert(!executed.filters.some((filter: any) => filter.column === "mount_raw"), "unstated mount preference must not enter catalog query");
