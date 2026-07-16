import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { collection, getDocs, getFirestore, limit, orderBy, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD486cV5aa3chf6zeq8Cr28dnXT5XAbQgY",
  authDomain: "levantamiento-sku.firebaseapp.com",
  projectId: "levantamiento-sku",
  storageBucket: "levantamiento-sku.firebasestorage.app",
  messagingSenderId: "322919219291",
  appId: "1:322919219291:web:1ead3108065ea1e66d7f7e",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function obtenerLevantamientos(filtros = {}) {
  const { limitCount = 100, fechaInicio, fechaFin, auditor, dmu, categoria } = filtros;
  
  let condiciones = [collection(db, "levantamientos")];
  
  if (auditor && auditor.trim() !== "") {
    condiciones.push(where("auditor", "==", auditor.trim()));
  }
  if (dmu && dmu.trim() !== "") {
    condiciones.push(where("dmu", "==", dmu.trim()));
  }
  if (categoria && categoria.trim() !== "") {
    condiciones.push(where("categoria", "==", categoria.trim()));
  }
  
  if (fechaInicio) {
    condiciones.push(where("fecha", ">=", new Date(fechaInicio + "T00:00:00")));
  }
  if (fechaFin) {
    condiciones.push(where("fecha", "<=", new Date(fechaFin + "T23:59:59")));
  }

  // Si filtramos por fecha, firestore requiere ordenar por ese campo primero
  condiciones.push(orderBy("fecha", "desc"));
  
  if (limitCount > 0) {
    condiciones.push(limit(limitCount));
  }

  const consulta = query(...condiciones);

  try {
    const resultado = await getDocs(consulta);
    return resultado.docs.map((documento) => ({
      id: documento.id,
      ...documento.data(),
    }));
  } catch (error) {
    // Si falla por índice faltante, Firestore arrojará el link para crearlo.
    console.error("Error consultando Firebase. Podría faltar un índice compuesto:", error);
    throw error;
  }
}

async function buscarPorEan(ean) {
  const consulta = query(
    collection(db, "levantamientos"),
    where("ean", "==", ean),
    limit(100)
  );

  const resultado = await getDocs(consulta);
  return resultado.docs.map((documento) => ({
    id: documento.id,
    ...documento.data(),
  }));
}

async function obtenerAuditores() {
  const consulta = query(collection(db, "auditores"));
  const resultado = await getDocs(consulta);
  return resultado.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function obtenerTiposNegocio() {
  const consulta = query(collection(db, "tipos_negocio"));
  const resultado = await getDocs(consulta);
  return resultado.docs.map(d => ({ id: d.id, ...d.data() }));
}

function escucharNuevosLevantamientos(callback) {
  // Obtenemos TODO el historial sin orderBy para evitar que Firebase filtre documentos sin campo "fecha"
  const consulta = query(
    collection(db, "levantamientos")
  );

  return onSnapshot(consulta, (snapshot) => {
    const nuevosRegistros = [];
    console.log("[Firebase onSnapshot] Recibidos cambios:", snapshot.docChanges().length);
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added" || change.type === "modified") {
         nuevosRegistros.push({ id: change.doc.id, ...change.doc.data() });
      }
    });
    console.log("[Firebase onSnapshot] Registros válidos (added/modified):", nuevosRegistros.length);
    if (nuevosRegistros.length > 0) {
      callback(nuevosRegistros);
    }
  }, (error) => {
    console.error("[Firebase onSnapshot] Error crítico:", error);
    if (window.App && window.App.showToast) {
       window.App.showToast("Error en tiempo real Firebase: " + error.message, "danger");
    }
  });
}

// Expose globally for vanilla JS compatibility
window.FirebaseAPI = {
  obtenerLevantamientos,
  buscarPorEan,
  obtenerAuditores,
  obtenerTiposNegocio,
  escucharNuevosLevantamientos
};
