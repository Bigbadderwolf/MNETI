/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { appDir: true },
  env: {
    NEXT_PUBLIC_API_URL:            process.env.NEXT_PUBLIC_API_URL            || "http://localhost:4000",
    NEXT_PUBLIC_KESH_PROGRAM_ID:    process.env.NEXT_PUBLIC_KESH_PROGRAM_ID    || "AuTWVK7aWU1RZ2fESWmaWX1oPExAtqNMmJ8m8TerXXMR",
    NEXT_PUBLIC_VAULT_PROGRAM_ID:   process.env.NEXT_PUBLIC_VAULT_PROGRAM_ID   || "Vau1tSMARTmneti5Ph4seXXXXXXXXXXXXXXXXXXXXXX",
    NEXT_PUBLIC_PAYMENTS_PROGRAM_ID:process.env.NEXT_PUBLIC_PAYMENTS_PROGRAM_ID|| "PAY6mnetiXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    NEXT_PUBLIC_REMITTANCE_PROGRAM_ID:process.env.NEXT_PUBLIC_REMITTANCE_PROGRAM_ID||"REM7mnetiXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    NEXT_PUBLIC_SOLANA_RPC:         process.env.NEXT_PUBLIC_SOLANA_RPC         || "https://api.devnet.solana.com",
  },
  webpack: (config) => {
    config.resolve.fallback = { fs: false, path: false, crypto: false };
    return config;
  },
};

module.exports = nextConfig;
