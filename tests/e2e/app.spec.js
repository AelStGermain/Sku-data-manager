import { expect, test } from "@playwright/test";

/* global DB */

const testProduct = {
  ean: "4006381333931",
  name: "Café QA Automatizado",
  brand: "Marca QA",
  universalCategory: "GROCERY STORE",
  status: "active",
  dataSource: "manual",
  holdings: {
    jumbo: {
      customerId: "QA-1",
      localProductName: "Café QA Jumbo",
      localCategoryName: "ABARROTES",
      isActiveHolding: true,
    },
  },
};

async function openApp(page, path = "/") {
  await page.route("https://**", (route) => route.abort());
  await page.goto(path);
  await expect(page.locator("#global-loader")).toHaveCount(0, {
    timeout: 15_000,
  });
}

test.beforeAll(async ({ request }) => {
  const response = await request.post("/api/products/bulk", {
    data: {
      products: [testProduct],
      holdingRelations: [
        {
          ean: testProduct.ean,
          retailer_id: "jumbo",
          internal_sku_id: "QA-1",
          local_product_name: "Café QA Jumbo",
          retailer_category: "ABARROTES",
          is_trained: true,
        },
      ],
      user: "playwright",
    },
  });
  expect(response.ok()).toBe(true);
});

test.afterAll(async ({ request }) => {
  const response = await request.delete("/api/products", {
    data: { eans: [testProduct.ean] },
  });
  expect(response.ok()).toBe(true);
});

test("carga la SPA, muestra datos del backend y conserva seguridad HTTP", async ({
  page,
  request,
}) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const health = await request.get("/health");
  expect(health.ok()).toBe(true);
  expect((await health.json()).data.status).toBe("ok");
  expect(health.headers()["x-content-type-options"]).toBe("nosniff");

  await openApp(page);

  await expect(page).toHaveTitle(/Smart Shelf/);
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("SKUs en Catálogo", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".dash-kpi-card").first().locator(".dash-kpi-val"),
  ).toHaveText("1");
  expect(pageErrors).toEqual([]);
});

test("busca un SKU en catálogo, abre su ficha y la cierra", async ({
  page,
}) => {
  await openApp(page, "/#catalog");

  await expect(
    page.getByRole("heading", {
      name: "Catálogo de Productos",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("#cat-filter-holding-category")).toBeDisabled();
  await page.locator("#cat-filter-universal").selectOption("GROCERY STORE");
  await expect(page.locator("#cat-filter-holding-category")).toBeEnabled();
  await expect(
    page.locator('#cat-filter-holding-category optgroup[label="Jumbo"]'),
  ).toHaveCount(1);
  await page.locator("#cat-filter-holding-category").selectOption("ABARROTES");
  await page.locator("#cat-search").fill(testProduct.ean);
  await expect(
    page.locator(`[data-ean="${testProduct.ean}"]`).first(),
  ).toBeVisible();
  await expect(page.getByText(testProduct.name).first()).toBeVisible();

  await page.locator(`[data-ean="${testProduct.ean}"]`).first().click();
  await expect(page.locator("#sheet-overlay")).not.toHaveClass(/hidden/);
  await expect(
    page.locator(`#sheet-content input[value="${testProduct.ean}"]`),
  ).toBeVisible();
  await expect(
    page.locator(`#sheet-content input[value="${testProduct.name}"]`),
  ).toBeVisible();

  await page.locator('[title="Cerrar (X)"]').click();
  await expect(page.locator("#sheet-overlay")).toHaveClass(/hidden/);
});

test("navega por módulos y persiste la preferencia de tema", async ({
  page,
}) => {
  await openApp(page);

  await page.locator("#nav-holdings").click();
  await expect(page).toHaveURL(/#holdings$/);
  await expect(
    page.getByRole("heading", { name: "Holdings", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".retailer-card-banner")).toHaveCount(0);
  await page.getByRole("button", { name: "Agregar Holding" }).first().click();
  await expect(page.locator("#r-logo")).toHaveCount(0);
  await expect(page.locator("#cat-new-input")).toHaveCount(0);
  await expect(
    page.getByText(
      "Las categorías locales de cada holding se administran únicamente desde la Jerarquía de Categorías",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).click();

  await page.locator("#nav-import").click();
  await expect(page).toHaveURL(/#import$/);
  await expect(
    page.getByRole("heading", { name: "Importar SKUs", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#file-input")).toHaveAttribute(
    "accept",
    ".csv,.xlsx,.xls",
  );

  await page.locator("#theme-toggle-btn").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("heading", { name: "Importar SKUs", exact: true }),
  ).toBeVisible();
});

test("filtra Levantamiento por aliases y estructuras heredadas de holding", async ({
  page,
  request,
}) => {
  const products = [
    {
      ean: "101",
      name: "Levantamiento Jumbo QA",
      dataSource: "firebase",
      fromFirebase: true,
      levantamientoMeta: {
        holdingId: "Jumbo",
        timestamp: "2026-07-20T10:00:00.000Z",
      },
    },
    {
      ean: "202",
      name: "Levantamiento Tottus QA",
      dataSource: "levantamiento",
      fromLevantamiento: true,
      levantamientoMeta: { timestamp: "2026-07-21T10:00:00.000Z" },
      retailers: { tottus: { retailerId: "tottus" } },
    },
  ];
  await request.post("/api/products/bulk", {
    data: {
      products,
      holdingRelations: [
        {
          ean: "202",
          retailer_id: "tottus",
          retailer_category: "DESPENSA",
          is_trained: true,
        },
      ],
    },
  });

  try {
    await openApp(page, "/#levantamiento");
    await expect(
      page.getByRole("heading", {
        name: "Levantamiento de Terreno",
        exact: true,
      }),
    ).toBeVisible();

    await page.locator("#fb-filter-holding").selectOption("jumbo");
    await expect(page.locator(".lev-raw-table-wrap")).toContainText(
      "Levantamiento Jumbo QA",
    );
    await expect(page.locator(".lev-raw-table-wrap")).not.toContainText(
      "Levantamiento Tottus QA",
    );

    await page.locator("#fb-filter-holding").selectOption("tottus");
    await expect(page.locator(".lev-raw-table-wrap")).toContainText(
      "Levantamiento Tottus QA",
    );
    await expect(page.locator(".lev-raw-table-wrap")).not.toContainText(
      "Levantamiento Jumbo QA",
    );
  } finally {
    await request.delete("/api/products", {
      data: { eans: products.map((product) => product.ean) },
    });
  }
});

test("transfiere Customer ID desde Avistamientos a la ficha técnica", async ({
  page,
  request,
}) => {
  await openApp(page);
  await page.evaluate(() => {
    DB.addStagingUnmatched({
      id: "avistamiento-qa",
      ean: "TERRENO-QA",
      type: "field_discovery",
      isTentativeEAN: true,
      description: "Producto avistado QA",
      holdingId: "jumbo",
      timestamp: "2026-07-22T10:00:00.000Z",
    });
  });

  try {
    await page.locator("#nav-avistamientos").click();
    await page.locator("#inline-customer-TERRENO-QA").fill("CUSTOMER-QA-77");
    await page.locator("#inline-ean-TERRENO-QA").fill("123");
    await page.getByRole("button", { name: "OK", exact: true }).click();

    await expect(page.locator("#sheet-overlay")).not.toHaveClass(/hidden/);
    await expect(
      page.locator('#sheet-content input[value="123"]'),
    ).toBeVisible();
    await expect(
      page.locator('#sheet-content input[value="CUSTOMER-QA-77"]'),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Guardar Cambios", exact: true })
      .click();
    await expect
      .poll(async () => {
        const response = await request.get("/api/products");
        const payload = await response.json();
        return payload.data.retailer_catalog.find(
          (relation) =>
            relation.ean === "123" && relation.retailer_id === "jumbo",
        )?.internal_sku_id;
      })
      .toBe("CUSTOMER-QA-77");
  } finally {
    await request.delete("/api/products", { data: { eans: ["123"] } });
    await request.post("/api/staging/ss_staging_unmatched", { data: [] });
  }
});
