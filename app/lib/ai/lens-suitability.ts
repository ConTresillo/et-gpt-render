export type LensRequirements = { sensorDiagonalMm?: number; sensorWidthMm?: number; sensorHeightMm?: number; sensorSizeMm?: number; workingDistanceMm?: number; focalLengthMm?: number; mount?: string; resolutionMp?: number; cameraType?: "area-scan" | "line-scan" };
export const defaultSuitabilityColumns = {
  imageCircle: ["image_circle_mm", "max_image_circle_mm", "image_circle_diameter_mm"],
  mount: ["mount_raw", "mount"], resolution: ["megapixel_rating", "resolution_mp"],
  workingDistanceMin: ["wd_min_mm", "working_distance_min_mm"], workingDistanceMax: ["wd_max_mm", "working_distance_max_mm"],
  workingDistance: ["wd_mm", "working_distance_mm"], cameraType: ["camera_type", "camera_type_raw"]
};
export type SuitabilityColumns = typeof defaultSuitabilityColumns;
export function lensRequirements(text: string, known: Record<string, unknown> = {}): LensRequirements {
  const numeric = (label: string, suffix = "mm") => { const match = [...text.matchAll(new RegExp(`${label}\\s*(?:[=:]\\s*)?(\\d+(?:\\.\\d+)?)\\s*${suffix}\\b`, "gi"))].at(-1); return match ? Number(match[1]) : undefined; };
  const mount = [...text.matchAll(/\b(CS|C|M12)[ -]?mount\b/gi)].at(-1)?.[1]?.toUpperCase();
  const type = [...text.matchAll(/\b(area|line)[ -]?scan\b/gi)].at(-1)?.[1]?.toLowerCase();
  return { sensorDiagonalMm: numeric("sensor diagonal"), sensorWidthMm: numeric("sensor width") ?? known.sensor_width_mm as number | undefined,
    sensorHeightMm: numeric("sensor height"), sensorSizeMm: known.sensor_size_mm as number | undefined,
    workingDistanceMm: known.working_distance_mm as number | undefined, focalLengthMm: known.focal_length_mm as number | undefined,
    mount, resolutionMp: numeric("(?:camera resolution|resolution|camera)", "(?:MP|megapixels?)"), cameraType: type ? `${type}-scan` as "area-scan" | "line-scan" : undefined };
}
export function checkLens(row: Record<string, unknown>, requirements: LensRequirements, columns = defaultSuitabilityColumns) {
  const raw = (keys: string[]) => keys.map(key => row[key]).find(value => value != null);
  const number = (keys: string[]) => { const value = raw(keys); return value != null && Number.isFinite(Number(value)) ? Number(value) : undefined; };
  const check = (status: "verified" | "incompatible" | "unverified", detail: string) => ({ status, detail });
  const circle = number(columns.imageCircle);
  const width = requirements.sensorWidthMm, height = requirements.sensorHeightMm, diagonal = requirements.sensorDiagonalMm;
  const coverage = diagonal != null && circle != null ? check(circle >= diagonal ? "verified" : "incompatible", `Listed image circle ${circle} mm; sensor diagonal ${diagonal} mm`)
    : circle != null && ((width != null && circle < width) || (height != null && circle < height)) ? check("incompatible", "Listed image circle is smaller than a stated sensor dimension")
    : check("unverified", `Need sensor diagonal and a catalog image-circle specification in mm${requirements.sensorSizeMm ? "; the supplied sensor dimension does not identify its axis" : ""}`);
  const normalizeMount = (value: unknown) => String(value).replace(/[ _-]/g, "").replace(/mount$/i, "").toUpperCase();
  const listedMount = raw(columns.mount);
  const mount = requirements.mount && listedMount ? check(normalizeMount(listedMount) === normalizeMount(requirements.mount) ? "verified" : "incompatible", `Requested ${requirements.mount}; listed ${listedMount}`) : check("unverified", "Camera mount or catalog mount is missing");
  const min = number(columns.workingDistanceMin), max = number(columns.workingDistanceMax), wd = requirements.workingDistanceMm;
  const workingDistance = wd != null && min != null && max != null ? check(wd >= min && wd <= max ? "verified" : "incompatible", `Required ${wd} mm; listed range ${min}–${max} mm`)
    : check("unverified", `Need a supported working-distance range${number(columns.workingDistance) != null ? `; catalog lists ${number(columns.workingDistance)} mm as a single value` : ""}`);
  const mp = number(columns.resolution);
  const resolution = requirements.resolutionMp != null && mp != null ? check(mp >= requirements.resolutionMp ? "verified" : "incompatible", `Required ${requirements.resolutionMp} MP; listed rating ${mp} MP (pixel pitch/optical performance still require review)`)
    : check("unverified", "Camera resolution/pixel pitch or catalog resolution rating is missing");
  const listedType = String(raw(columns.cameraType) ?? "").toLowerCase().replace(/[_ ]/g, "-");
  const cameraType = requirements.cameraType && ["area-scan", "line-scan"].includes(listedType) ? check(listedType === requirements.cameraType ? "verified" : "incompatible", `Required ${requirements.cameraType}; listed ${listedType}`)
    : check("unverified", "Camera type or an explicit catalog camera-type specification is missing");
  const checks = { coverage, mount, workingDistance, resolution, cameraType };
  return { verdict: Object.values(checks).some(value => value.status === "incompatible") ? "incompatible" : Object.values(checks).every(value => value.status === "verified") ? "verified against listed checks" : "unverified candidate", checks };
}
