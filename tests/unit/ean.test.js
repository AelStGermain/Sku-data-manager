import { describe, expect, test } from "@jest/globals";
import {
  consolidateMaster,
  hasEanKey,
  normalizeEanKey,
} from "../../src/utils/ean.js";

describe("utilidades de EAN", () => {
  test("reconoce claves presentes y normaliza espacios sólo en códigos numéricos", () => {
    expect(hasEanKey(" 780 123 ")).toBe(true);
    expect(hasEanKey(0)).toBe(true);
    expect(hasEanKey("   ")).toBe(false);
    expect(hasEanKey(null)).toBe(false);

    expect(normalizeEanKey(" 780 123 ")).toBe("780123");
    expect(normalizeEanKey(780123)).toBe("780123");
    expect(normalizeEanKey(" SKU 123 ")).toBe("SKU 123");
  });

  test("descarta filas sin EAN y consolida duplicados completando campos vacíos", () => {
    const result = consolidateMaster([
      { ean: " 780 123 ", name: "", brand: "Marca A" },
      { ean: "780123", name: "Producto", brand: "Marca A" },
      { ean: "", name: "Sin código" },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      ean: "780123",
      name: "Producto",
      brand: "Marca A",
    });
    expect(result[0].duplicateConflicts).toBeUndefined();
  });

  test("registra conflictos y prioriza la fila proveniente de terreno", () => {
    const result = consolidateMaster([
      { ean: "780123", name: "Nombre maestro", status: "active" },
      {
        ean: "780123",
        name: "Nombre terreno",
        fromFirebase: true,
        status: "new",
      },
    ]);

    expect(result[0].name).toBe("Nombre terreno");
    expect(result[0].status).toBe("review");
    expect(result[0].duplicateConflicts).toEqual(
      expect.arrayContaining([
        { field: "name", values: ["Nombre maestro", "Nombre terreno"] },
      ]),
    );
  });
});
