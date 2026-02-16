const { createClient } = require('@libsql/client');

const client = createClient({
  url: 'libsql://solnew-metasal1.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzA5NDM3OTAsImlkIjoiOWJiM2YzMzMtMjY0MC00MjE2LWE5NGMtMzI5MTMwYmZmYmE4IiwicmlkIjoiMWI5NWMxMzYtOWY2NS00MzEyLTlkZDgtNmU2ZDE2Nzg5YWU4In0.nwF4LPlPIaSGIAtZTVkNVVPLwMm1CiElcCw8yghfYflJG1ljTxBF55rJfR9SOUXfZ2GunRvBj1xMe3F7OCuQBg'
});

async function getStats() {
  try {
    // Total counts
    const wallets = await client.execute("SELECT COUNT(*) as count FROM wallets");
    const tokens = await client.execute("SELECT COUNT(*) as count FROM tokens");
    const nfts = await client.execute("SELECT COUNT(*) as count FROM nfts");

    // New in last 24h (assuming created_at column)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    let newWallets, newTokens, newNfts;
    try {
      newWallets = await client.execute({
        sql: "SELECT COUNT(*) as count FROM wallets WHERE created_at >= ?",
        args: [yesterday]
      });
    } catch (e) {
      newWallets = { rows: [{ count: 0 }] };
    }

    try {
      newTokens = await client.execute({
        sql: "SELECT COUNT(*) as count FROM tokens WHERE created_at >= ?",
        args: [yesterday]
      });
    } catch (e) {
      newTokens = { rows: [{ count: 0 }] };
    }

    try {
      newNfts = await client.execute({
        sql: "SELECT COUNT(*) as count FROM nfts WHERE created_at >= ?",
        args: [yesterday]
      });
    } catch (e) {
      newNfts = { rows: [{ count: 0 }] };
    }

    console.log('📊 SOL.NEW DAILY STATS');
    console.log(`Total: ${wallets.rows[0].count} wallets | ${tokens.rows[0].count} tokens | ${nfts.rows[0].count} NFTs`);
    console.log(`New (24h): ${newWallets.rows[0].count} wallets | ${newTokens.rows[0].count} tokens | ${newNfts.rows[0].count} NFTs`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
  }
}

getStats();
