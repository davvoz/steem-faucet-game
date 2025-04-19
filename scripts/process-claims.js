/**
 * Script per processare le richieste di STEEM pendenti
 * Questo script è progettato per essere eseguito tramite GitHub Actions
 * È un'alternativa gratuita alle Firebase Cloud Functions
 */

// Imports
const admin = require('firebase-admin');
const { Client, PrivateKey } = require('dsteem');
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
const fcm = admin.messaging();

// Configura Steem Client
const steemNodes = ['https://api.steemit.com', 'https://rpc.steemviz.com', 'https://steemd.minnowsupportproject.org'];
const client = new Client(steemNodes[0]);

// Credenziali Steem (dal wallet micro.cur8)
const steemAccount = process.env.STEEM_ACCOUNT || 'micro.cur8';
const steemPrivateKey = PrivateKey.fromString(process.env.STEEM_PRIVATE_KEY);

// Funzione principale
async function processClaims() {
  try {
    console.log('🔍 Cercando richieste pendenti...');
    
    // Ottieni richieste pendenti dal database (limit 10 per esecuzione)
    const pendingClaims = await db.collection('faucet_claims')
      .where('status', '==', 'pending')
      .orderBy('timestamp', 'asc')
      .limit(10)
      .get();
    
    if (pendingClaims.empty) {
      console.log('Nessuna richiesta pendente trovata.');
      return;
    }
    
    console.log(`Trovate ${pendingClaims.size} richieste pendenti da processare.`);
    
    // Processa ogni richiesta
    const processPromises = pendingClaims.docs.map(async (doc) => {
      const claim = doc.data();
      const claimId = doc.id;
      
      console.log(`Processamento claim ID: ${claimId} per ${claim.steemUsername} (${claim.amount} STEEM)`);
      
      try {
        // Verifica che l'account Steem esista
        const accounts = await client.database.getAccounts([claim.steemUsername]);
        if (!accounts || accounts.length === 0) {
          console.error(`Account Steem ${claim.steemUsername} non trovato!`);
          await updateClaimStatus(claimId, 'failed', 'Account Steem non trovato');
          return;
        }
        
        // Esegui la transazione Steem
        const memo = `Steem Faucet Game Reward - Enjoy your ${claim.amount} STEEM!`;
        const amountString = `${claim.amount.toFixed(3)} STEEM`;
        
        console.log(`Invio di ${amountString} a ${claim.steemUsername}`);
        
        const transfer = await client.broadcast.transfer({
          from: steemAccount,
          to: claim.steemUsername,
          amount: amountString,
          memo: memo
        }, steemPrivateKey);
        
        // Aggiorna lo stato della richiesta a completato
        await updateClaimStatus(claimId, 'completed', null, transfer.id);
        
        // Invia una notifica all'utente
        await sendNotification(claim.userId, 'Ricompensa ricevuta!', 
          `Hai ricevuto ${claim.amount} STEEM nel tuo wallet.`);
        
        console.log(`✅ Transazione completata: ${transfer.id}`);
      } catch (error) {
        console.error(`❌ Errore durante il processamento del claim ${claimId}:`, error);
        await updateClaimStatus(claimId, 'failed', error.message);
      }
    });
    
    await Promise.all(processPromises);
    console.log('Elaborazione completata.');
    
  } catch (error) {
    console.error('Errore durante il processamento:', error);
  }
}

// Aggiorna lo stato della richiesta nel database
async function updateClaimStatus(claimId, status, errorMessage = null, transactionId = null) {
  const updateData = {
    status: status,
    processedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  
  if (errorMessage) {
    updateData.error = errorMessage;
  }
  
  if (transactionId) {
    updateData.transactionId = transactionId;
  }
  
  await db.collection('faucet_claims').doc(claimId).update(updateData);
}

// Invia una notifica FCM all'utente
async function sendNotification(userId, title, body) {
  try {
    // Ottieni i token FCM dell'utente
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      console.log(`Utente ${userId} non trovato per la notifica.`);
      return;
    }
    
    const userData = userDoc.data();
    if (!userData.fcmTokens || userData.fcmTokens.length === 0) {
      console.log(`Nessun token FCM trovato per l'utente ${userId}.`);
      return;
    }
    
    // Invia notifica a tutti i dispositivi dell'utente
    const message = {
      notification: {
        title: title,
        body: body
      },
      data: {
        type: 'faucet_claim',
        click_action: 'FLUTTER_NOTIFICATION_CLICK'
      },
      tokens: userData.fcmTokens
    };
    
    const response = await fcm.sendMulticast(message);
    console.log(`Notifica inviata con successo: ${response.successCount} di ${response.totalCount}`);
  } catch (error) {
    console.error('Errore durante l\'invio della notifica:', error);
  }
}

// Esegui lo script
processClaims()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Errore fatale:', error);
    process.exit(1);
  });