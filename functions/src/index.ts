/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {onRequest, onCall, HttpsError} from "firebase-functions/v2/https";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import * as https from "https";

// Inizializza l'app di Firebase Admin
admin.initializeApp();

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

export const helloWorld = onRequest((request, response) => {
  logger.info("Hello logs!", {structuredData: true});
  response.send("Hello from Firebase!");
});

/**
 * Funzione per l'erogazione di token STEEM attraverso il faucet
 * Supporta due modalità: tramite libreria dsteem o tramite curl/HTTP
 */
export const distributeSteem = onCall(async (request) => {
  // Verifica se l'utente è autenticato
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated", 
      "La funzione richiede l'autenticazione."
    );
  }

  const { steemUsername, amount, useLibrary = true } = request.data;
  const userId = request.auth.uid;

  // Validazione dei parametri di input
  if (!steemUsername || typeof steemUsername !== "string") {
    throw new HttpsError(
      "invalid-argument", 
      "È richiesto un username Steem valido."
    );
  }

  if (!amount || typeof amount !== "number" || amount <= 0 || amount > 0.01) {
    throw new HttpsError(
      "invalid-argument", 
      "L'importo deve essere un numero positivo non superiore a 0.01 STEEM."
    );
  }

  try {
    // Verifica se l'utente esiste nel database
    const userRef = admin.firestore().collection("users").doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      throw new HttpsError("not-found", "Utente non trovato.");
    }
    
    const userData = userDoc.data();
    
    // Verifica del cooldown (24 ore)
    if (userData?.lastFaucetClaim) {
      const lastClaim = userData.lastFaucetClaim.toDate();
      const now = new Date();
      const hoursSinceLastClaim = 
        (now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceLastClaim < 24) {
        throw new HttpsError(
          "failed-precondition", 
          `Potrai richiedere nuovamente tra ${Math.ceil(24 - hoursSinceLastClaim)} ore.`
        );
      }
    }

    // Verifica se lo username Steem esiste
    let accountExists = false;
    
    if (useLibrary) {
      // Utilizzo libreria dsteem (nota: in produzione questa richiederà l'importazione della libreria)
      accountExists = await checkSteemAccountWithLibrary(steemUsername);
    } else {
      // Utilizzo chiamata HTTP diretta
      accountExists = await checkSteemAccountWithHttp(steemUsername);
    }
    
    if (!accountExists) {
      throw new HttpsError("not-found", "Username Steem non trovato.");
    }

    // Invio dei token STEEM
    let txId = "";
    
    if (useLibrary) {
      // Utilizzo libreria dsteem per l'invio (implementazione dimostrativa)
      txId = await sendSteemWithLibrary(steemUsername, amount);
    } else {
      // Utilizzo chiamata HTTP per l'invio
      txId = await sendSteemWithHttp(steemUsername, amount);
    }

    // Aggiorna il documento di claim nel database
    const claimRef = admin.firestore().collection("faucet_claims").doc();
    await claimRef.set({
      userId,
      steemUsername,
      amount,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      status: "completed",
      transactionId: txId,
      userTier: userData?.faucetTier || 1,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      ipAddress: request.rawRequest.ip,
      userAgent: request.rawRequest.headers["user-agent"] || "unknown",
    });

    // Aggiorna i dati dell'utente
    await userRef.update({
      lastFaucetClaim: admin.firestore.FieldValue.serverTimestamp(),
      lastClaimStreak: admin.firestore.FieldValue.serverTimestamp(),
      consecutiveClaims: (userData?.consecutiveClaims || 0) + 1,
      totalClaimedAmount: (userData?.totalClaimedAmount || 0) + amount,
      lastClaimAmount: amount,
    });

    // Restituisci i dati dell'operazione riuscita
    return {
      success: true,
      message: `Hai ricevuto ${amount} STEEM con successo!`,
      txId,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error("Errore nell'erogazione del faucet", error);
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError(
      "internal", 
      `Si è verificato un errore: ${error instanceof Error ? error.message : "Errore sconosciuto"}`
    );
  }
});

/**
 * Ascolta la creazione di documenti nella collezione faucet_claims
 * per processare i pagamenti in modo asincrono
 */
export const processFaucetClaim = onDocumentCreated(
  "faucet_claims/{claimId}",
  async (event) => {
    const claim = event.data?.data();
    
    if (!claim || claim.status !== "pending") {
      return null;
    }
    
    try {
      logger.info(`Processamento claim faucet per ${claim.steemUsername}`, 
        { claimId: event.params.claimId });
      
      // In un ambiente di produzione, qui si utilizzerebbe una chiave privata sicura
      // per effettuare la transazione sulla blockchain Steem
      const txId = `sim-tx-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
      
      // Aggiorna il documento con lo stato completato
      await event.data?.ref.update({
        status: "completed",
        transactionId: txId,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      logger.info(`Claim faucet completato con successo`, 
        { claimId: event.params.claimId, txId });
      
      return { success: true, txId };
    } catch (error) {
      logger.error(`Errore nel processamento del claim faucet`, 
        { claimId: event.params.claimId, error });
      
      // Aggiorna il documento con lo stato fallito
      await event.data?.ref.update({
        status: "failed",
        error: error instanceof Error ? error.message : "Errore sconosciuto",
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      return { success: false, error };
    }
  }
);

/**
 * Verifica l'esistenza di un account Steem utilizzando una libreria
 * Nota: In produzione, questa funzione richiederebbe l'importazione di dsteem
 */
async function checkSteemAccountWithLibrary(username: string): Promise<boolean> {
  // Simulazione della verifica (in produzione si userebbe dsteem)
  // const client = new dsteem.Client('https://api.steemit.com');
  // const accounts = await client.database.getAccounts([username]);
  // return accounts && accounts.length > 0;
  
  // Per ora, facciamo una verifica fittizia (da sostituire in produzione)
  return new Promise((resolve) => {
    setTimeout(() => {
      // Simula che l'account esiste (eccetto per alcuni nomi specifici)
      resolve(username.toLowerCase() !== "nonexistentuser");
    }, 500);
  });
}

/**
 * Verifica l'esistenza di un account Steem utilizzando una chiamata HTTP diretta
 */
async function checkSteemAccountWithHttp(username: string): Promise<boolean> {
  const requestData = JSON.stringify({
    jsonrpc: "2.0",
    method: "condenser_api.get_accounts",
    params: [[username]],
    id: 1
  });
  
  const options = {
    hostname: "api.steemit.com",
    port: 443,
    path: "/",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(requestData)
    }
  };
  
  return new Promise((resolve, reject) => {
    try {
      const req = https.request(options, (res) => {
        let data = "";
        
        res.on("data", (chunk) => {
          data += chunk;
        });
        
        res.on("end", () => {
          try {
            const response = JSON.parse(data);
            resolve(response.result && response.result.length > 0);
          } catch (e) {
            logger.error("Errore nel parsing della risposta", e);
            reject(new Error("Errore nel controllo dell'account Steem"));
          }
        });
      });
      
      req.on("error", (e) => {
        logger.error("Errore nella richiesta HTTP", e);
        reject(e);
      });
      
      req.write(requestData);
      req.end();
    } catch (e) {
      logger.error("Errore nell'inizializzazione della richiesta HTTP", e);
      reject(e);
    }
  });
}

/**
 * Invia STEEM utilizzando una libreria
 * Nota: In produzione, questa funzione richiederebbe l'importazione di dsteem
 */
async function sendSteemWithLibrary(
  recipient: string,
  amount: number
): Promise<string> {
  // Simulazione dell'invio (in produzione si userebbe dsteem con una chiave privata)
  // const privateKey = process.env.STEEM_PRIVATE_KEY;
  // const client = new dsteem.Client('https://api.steemit.com');
  // const transfer = await client.broadcast.transfer({
  //   from: "faucet-account",
  //   to: recipient,
  //   amount: `${amount.toFixed(3)} STEEM`,
  //   memo: "Steem Faucet Game Reward"
  // }, dsteem.PrivateKey.fromString(privateKey));
  // return transfer.transaction_id;
  
  // Per ora, restituiamo un ID transazione simulato
  return `sim-lib-tx-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

/**
 * Invia STEEM utilizzando una chiamata HTTP diretta
 */
async function sendSteemWithHttp(recipient: string, amount: number): Promise<string> {
  // In produzione, questo utilizzerebbe una chiave privata sicura
  // e farebbe una chiamata HTTP per trasmettere la transazione
  
  // Qui simulo solo un ID transazione
  // In un'implementazione reale, si dovrebbe firmare la transazione e inviarla
  return `sim-http-tx-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}
