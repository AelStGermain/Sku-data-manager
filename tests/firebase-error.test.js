import test from "node:test";
import assert from "node:assert/strict";
import { formatFirestoreError } from "../src/services/FirebaseService.js";

const context = {
  projectId: "levantamiento-sku",
  databaseId: "(default)",
};

test("Firestore NOT_FOUND entrega un diagnóstico de proyecto y base", () => {
  const message = formatFirestoreError(
    { code: 5, message: "5 NOT_FOUND: not found" },
    context,
  );
  assert.match(message, /levantamiento-sku/);
  assert.match(message, /\(default\)/);
  assert.match(message, /FIREBASE_DATABASE_ID/);
  assert.doesNotMatch(message, /Error de red/);
});

test("Firestore PERMISSION_DENIED se distingue de un error de red", () => {
  const message = formatFirestoreError(
    { code: 7, message: "PERMISSION_DENIED" },
    context,
  );
  assert.match(message, /no tiene permiso/);
});
