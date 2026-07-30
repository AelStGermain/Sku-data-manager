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
});
