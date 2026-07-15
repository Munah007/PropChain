// Find the Privy wallet ID for a Solana address, and print the exact
// RECOVER_USERS value to restore an account's email→wallet mapping.
//
// Usage (with your Railway Privy credentials):
//   PRIVY_APP_ID=... PRIVY_APP_SECRET=... \
//   node scripts/recover-wallet.mjs <solana-address> <email> [name]
//
// e.g. node scripts/recover-wallet.mjs 972j...g2NZ uzoezieemmanuel@gmail.com Emmanuel

const [, , address, email, name] = process.argv;
const appId = process.env.PRIVY_APP_ID;
const appSecret = process.env.PRIVY_APP_SECRET;

if (!address || !email) {
  console.error("Usage: node scripts/recover-wallet.mjs <solana-address> <email> [name]");
  process.exit(1);
}
if (!appId || !appSecret) {
  console.error("Set PRIVY_APP_ID and PRIVY_APP_SECRET (from your Railway variables).");
  process.exit(1);
}

const auth = "Basic " + Buffer.from(`${appId}:${appSecret}`).toString("base64");
const headers = { Authorization: auth, "privy-app-id": appId, "Content-Type": "application/json" };

// Page through the app's wallets and match the address.
async function findWalletId() {
  let cursor = "";
  for (let page = 0; page < 200; page++) {
    const url = `https://api.privy.io/v1/wallets?limit=100${cursor ? `&cursor=${cursor}` : ""}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Privy API ${res.status}: ${await res.text()}`);
    }
    const body = await res.json();
    const wallets = body.data ?? body.wallets ?? [];
    for (const w of wallets) {
      if (w.address === address) return w.id;
    }
    cursor = body.next_cursor ?? body.nextCursor ?? "";
    if (!cursor || wallets.length === 0) break;
  }
  return null;
}

const walletId = await findWalletId();
if (!walletId) {
  console.error(`No Privy wallet found with address ${address}. Double-check the address and that these are the same Privy app credentials the Railway deploy uses.`);
  process.exit(2);
}

const record = { [email.toLowerCase()]: { walletId, address, name: name ?? undefined } };
console.log("\n✅ Found it. Set this as the RECOVER_USERS env var on Railway:\n");
console.log(JSON.stringify(record));
console.log("\n(Then redeploy once. Log in with the email and you're back on the same wallet.)");
