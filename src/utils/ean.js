export function hasEanKey(value) {
  return (
    (typeof value === "string" || typeof value === "number") &&
    String(value).trim().length > 0
  );
}

export function normalizeEanKey(value) {
  const raw = String(value ?? "").trim();
  return /^[\d\s]+$/.test(raw) ? raw.replace(/\s/g, "") : raw;
}

export function consolidateMaster(rows) {
  const byEan = new Map();
  for (const rawRow of rows) {
    const ean = normalizeEanKey(rawRow.ean);
    if (!ean) continue;
    const row = { ...rawRow, ean };
    const current = byEan.get(ean);
    if (!current) {
      byEan.set(ean, row);
      continue;
    }

    const merged = { ...current };
    const conflicts = [...(current.duplicateConflicts || [])];
    for (const [field, value] of Object.entries(row)) {
      const currentValue = merged[field];
      const hasValue = value !== undefined && value !== null && value !== "";
      if (
        (currentValue === undefined ||
          currentValue === null ||
          currentValue === "") &&
        hasValue
      ) {
        merged[field] = value;
      } else if (
        hasValue &&
        !["ean", "created_at", "updated_at", "duplicateConflicts"].includes(
          field,
        ) &&
        JSON.stringify(currentValue) !== JSON.stringify(value)
      ) {
        conflicts.push({ field, values: [currentValue, value] });
        if (row.fromFirebase || row.fromLevantamiento || row.levantamientoMeta)
          merged[field] = value;
      }
    }
    if (conflicts.length > 0) {
      merged.duplicateConflicts = conflicts;
      merged.status = "review";
    }
    byEan.set(ean, merged);
  }
  return [...byEan.values()];
}
