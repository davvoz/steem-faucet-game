/**
 * Script di inizializzazione del database Firestore
 * Questo script crea e inizializza le tabelle necessarie se non esistono
 */

const admin = require('firebase-admin');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Carica le variabili d'ambiente se in ambiente di sviluppo locale
if (fs.existsSync(path.join(__dirname, '.env'))) {
  dotenv.config();
}

// Configura Firebase Admin
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  // Per GitHub Actions, la variabile d'ambiente è una stringa JSON
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  // Per sviluppo locale, usa il file di service account
  serviceAccount = require('./serviceAccountKey.json');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Inizializza il database Firestore
const db = admin.firestore();

// Funzione principale
async function initDatabase() {
  try {
    console.log('🛠️ Inizializzazione del database...');
    
    // Inizializza le statistiche del faucet se non esistono
    await initFaucetStats();
    
    console.log('✅ Inizializzazione del database completata con successo.');
  } catch (error) {
    console.error('❌ Errore durante l\'inizializzazione del database:', error);
    process.exit(1);
  }
}

// Inizializza le statistiche del faucet
async function initFaucetStats() {
  const statsRef = db.collection('stats').doc('faucet');
  
  try {
    // Controlla se il documento esiste già
    const statsDoc = await statsRef.get();
    
    if (!statsDoc.exists) {
      console.log('📊 Creazione tabella stats/faucet...');
      
      // Se non esiste, crea il documento con valori iniziali
      await statsRef.set({
        totalDistributed: 0,
        totalUsers: 0,
        uniqueUsers: [],
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log('✅ Tabella stats/faucet creata con successo.');
    } else {
      console.log('📊 La tabella stats/faucet esiste già.');
      
      // Potremmo aggiornare i valori in base alle richieste storiche se necessario
      const claimsSnapshot = await db.collection('faucet_claims')
        .where('status', '==', 'completed')
        .get();
      
      if (!claimsSnapshot.empty) {
        // Aggiorna le statistiche in base ai dati storici
        await recalculateStatsFromHistory();
      }
    }
  } catch (error) {
    console.error('❌ Errore durante l\'inizializzazione delle statistiche del faucet:', error);
    throw error;
  }
}

// Ricalcola le statistiche in base allo storico delle richieste completate
async function recalculateStatsFromHistory() {
  try {
    console.log('🔄 Ricalcolo delle statistiche in base allo storico...');
    
    // Ottieni tutte le richieste completate
    const claimsSnapshot = await db.collection('faucet_claims')
      .where('status', '==', 'completed')
      .get();
    
    if (claimsSnapshot.empty) {
      console.log('Nessuna richiesta completata trovata.');
      return;
    }
    
    // Inizializza le variabili per le statistiche
    let totalDistributed = 0;
    const uniqueUsers = new Set();
    
    // Calcola le statistiche
    claimsSnapshot.forEach(doc => {
      const claim = doc.data();
      totalDistributed += claim.amount;
      uniqueUsers.add(claim.steemUsername);
    });
    
    // Aggiorna il documento delle statistiche
    await db.collection('stats').doc('faucet').set({
      totalDistributed: totalDistributed,
      totalUsers: uniqueUsers.size,
      uniqueUsers: Array.from(uniqueUsers),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      isRecalculated: true
    });
    
    console.log(`✅ Statistiche ricalcolate: ${totalDistributed} STEEM distribuiti a ${uniqueUsers.size} utenti.`);
  } catch (error) {
    console.error('❌ Errore durante il ricalcolo delle statistiche:', error);
    throw error;
  }
}

// Esegui lo script
initDatabase()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Errore fatale:', error);
    process.exit(1);
  });