import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { collection, getDocs, getFirestore, limit, orderBy, query, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

async function obtenerLevantamientos(cantidad = 25) {
  const consulta = query(
    collection(db, "levantamientos"),
    orderBy("fecha", "desc"),
    limit(cantidad)
  );

  const resultado = await getDocs(consulta);
  return resultado.docs.map((documento) => ({
    id: documento.id,
    ...documento.data(),
  }));
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

// Expose globally for vanilla JS compatibility
window.FirebaseAPI = {
  obtenerLevantamientos,
  buscarPorEan
};
