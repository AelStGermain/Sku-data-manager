import { describe, expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function loadLevantamiento() {
  const context = {
    App: {},
    console,
    DB: {
      getHoldings: () => [
        { id: "jumbo", name: "Jumbo" },
        { id: "tottus", name: "Tottus" },
      ],
    },
    document: {},
    localStorage: { getItem: () => null, setItem() {} },
    window: {},
  };
  context.window = context;
  const source = `${readFileSync(new URL("../../js/ui-levantamiento.js", import.meta.url), "utf8")}\nglobalThis.__levantamiento = UILevantamiento;`;
  vm.runInNewContext(source, context);
  return context.__levantamiento;
}

function loadStaging(product) {
  const removedBatchIds = [];
  const toasts = [];
  const context = {
    App: {
      showToast: (message, type) => toasts.push({ message, type }),
    },
    clearTimeout,
    console,
    DB: {
      getProduct: () => product,
      removeVisperaBatchItem: (batchId) => {
        removedBatchIds.push(batchId);
        return true;
      },
    },
    document: { getElementById: () => null },
    setTimeout,
    window: {},
  };
  context.window = context;
  const source = `${readFileSync(new URL("../../js/ui-staging.js", import.meta.url), "utf8")}\nglobalThis.__staging = UIStaging;`;
  vm.runInNewContext(source, context);
  return { removedBatchIds, staging: context.__staging, toasts };
}

describe("regresiones de usabilidad", () => {
  test("el filtro de Levantamiento normaliza nombres, IDs y retailers heredados", () => {
    const levantamiento = loadLevantamiento();

    expect(
      levantamiento.matchesHolding(
        { levantamientoMeta: { holdingId: "JUMBO" } },
        "jumbo",
      ),
    ).toBe(true);
    expect(
      levantamiento.matchesHolding(
        { levantamientoMeta: { holding: "Jumbo" } },
        "jumbo",
      ),
    ).toBe(true);
    expect(
      levantamiento.matchesHolding(
        { retailers: { TOTTUS: { retailerId: "Tottus" } } },
        "tottus",
      ),
    ).toBe(true);
    expect(
      levantamiento.matchesHolding({ holdings: { jumbo: {} } }, "tottus"),
    ).toBe(false);
  });

  test("la X cierra el ticket con ID sin modificar ni devolver el SKU a revisión", async () => {
    const product = {
      ean: "7791234567890",
      visperaId: "1234",
      status: "new",
      is_ready_for_vispera: true,
    };
    const originalProduct = { ...product };
    const { removedBatchIds, staging, toasts } = loadStaging(product);

    await staging.closeVisperaTicket("batch-1", product.ean);

    expect(removedBatchIds).toEqual(["batch-1"]);
    expect(product).toEqual(originalProduct);
    expect(toasts.at(-1)).toMatchObject({
      type: "success",
      message: expect.stringContaining("permanece asignado"),
    });
  });

  test("la X no elimina un ticket mientras falte el ID Vispera", async () => {
    const { removedBatchIds, staging, toasts } = loadStaging({
      ean: "7790987654321",
      visperaId: null,
      status: "review",
    });

    await staging.closeVisperaTicket("batch-2", "7790987654321");

    expect(removedBatchIds).toEqual([]);
    expect(toasts.at(-1)).toMatchObject({
      type: "warning",
      message: expect.stringContaining("Primero guarda"),
    });
  });
});
