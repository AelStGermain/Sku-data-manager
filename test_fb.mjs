import { initializeApp, getApps } from 'firebase-admin/app';  
import { getFirestore } from 'firebase-admin/firestore';  
if (!getApps().length) initializeApp({ projectId: 'levantamiento-sku' });  
const db = getFirestore();  
const snap = await db.collection('levantamientos').limit(3).get();  
console.log('DOCS:', snap.size);  
snap.docs.forEach(d = const d2 = d.data(); delete d2.fotoUrl; delete d2.fotoFlejeUrl; console.log(d.id, JSON.stringify(d2).slice(0,300)); });  
process.exit(0);  
