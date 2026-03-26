/**
 * MNETI Protocol — Phase 6
 * backend/src/services/ipfs/ipfs_client.ts
 *
 * IPFS Client for Travel Rule IVMS101 payload storage.
 *
 * Workflow:
 *   1. Originator VASP builds the full IVMS101 JSON payload
 *   2. ECIES-encrypt it with the beneficiary VASP's public key
 *   3. Upload the encrypted blob to IPFS via this client
 *   4. Store the returned CID in the TravelRulePayload on-chain account
 *   5. Beneficiary VASP fetches the blob using the CID and decrypts it
 *
 * Supports:
 *   - Infura IPFS (production)
 *   - Pinata (production alternative)
 *   - In-memory mock store (development / testing)
 */

import axios from "axios";
import { logger } from "../../utils/logger";
import * as crypto from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Ivms101Payload {
  originator: {
    name:          string;
    accountNumber: string;  // Solana wallet address
    address?:      string;
    dateOfBirth?:  string;
    countryOfResidence: string;
  };
  beneficiary: {
    name:          string;
    accountNumber: string;
    address?:      string;
    countryOfResidence: string;
  };
  transferAmount: {
    amount:   string;
    currency: string;
  };
  originatingVasp: {
    name: string;
    did:  string;
  };
  beneficiaryVasp: {
    name: string;
    did:  string;
  };
}

export interface UploadResult {
  cid:    string;
  url:    string;
  source: "infura" | "pinata" | "mock";
}

// ─── Mock store for development ───────────────────────────────────────────────

const mockStore = new Map<string, string>();

function mockUpload(encryptedBlob: Buffer): UploadResult {
  // Generate a deterministic mock CID from the content hash
  const hash = crypto.createHash("sha256").update(encryptedBlob).digest("hex");
  const cid  = `bafybeimock${hash.slice(0, 44)}`;
  mockStore.set(cid, encryptedBlob.toString("base64"));
  logger.info(`[IPFS] Mock upload — CID: ${cid.slice(0, 16)}...`);
  return { cid, url: `ipfs://${cid}`, source: "mock" };
}

export function mockFetch(cid: string): Buffer | null {
  const data = mockStore.get(cid);
  if (!data) return null;
  return Buffer.from(data, "base64");
}

// ─── Infura IPFS Upload ───────────────────────────────────────────────────────

async function uploadToInfura(encryptedBlob: Buffer): Promise<UploadResult> {
  const projectId  = process.env.INFURA_IPFS_PROJECT_ID!;
  const secret     = process.env.INFURA_IPFS_SECRET!;
  const auth       = Buffer.from(`${projectId}:${secret}`).toString("base64");

  const formData   = new FormData();
  formData.append("file", new Blob([encryptedBlob]), "ivms101.enc");

  const resp = await axios.post<{ Hash: string }>(
    "https://ipfs.infura.io:5001/api/v0/add?pin=true",
    formData,
    {
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type":  "multipart/form-data",
      },
      timeout: 15_000,
    }
  );

  const cid = resp.data.Hash;
  logger.info(`[IPFS] Infura upload — CID: ${cid}`);
  return { cid, url: `https://ipfs.infura.io/ipfs/${cid}`, source: "infura" };
}

// ─── Pinata IPFS Upload ───────────────────────────────────────────────────────

async function uploadToPinata(encryptedBlob: Buffer): Promise<UploadResult> {
  const jwt = process.env.PINATA_JWT!;

  const formData = new FormData();
  formData.append("file", new Blob([encryptedBlob]), "ivms101.enc");
  formData.append("pinataMetadata", JSON.stringify({ name: `mneti-tr-${Date.now()}` }));

  const resp = await axios.post<{ IpfsHash: string }>(
    "https://api.pinata.cloud/pinning/pinFileToIPFS",
    formData,
    {
      headers: {
        "Authorization": `Bearer ${jwt}`,
        "Content-Type":  "multipart/form-data",
      },
      timeout: 15_000,
    }
  );

  const cid = resp.data.IpfsHash;
  logger.info(`[IPFS] Pinata upload — CID: ${cid}`);
  return { cid, url: `https://gateway.pinata.cloud/ipfs/${cid}`, source: "pinata" };
}

// ─── ECIES Encryption ─────────────────────────────────────────────────────────
/**
 * Encrypts the IVMS101 JSON payload using AES-256-GCM with a random key,
 * then encrypts that key using the beneficiary VASP's RSA public key.
 *
 * Output format (all concatenated as Buffer):
 *   [4 bytes]  encryptedKeyLength (u32 BE)
 *   [N bytes]  RSA-OAEP encrypted AES key
 *   [12 bytes] AES-GCM IV
 *   [16 bytes] AES-GCM auth tag
 *   [M bytes]  AES-GCM encrypted payload
 *
 * In production, use the beneficiary VASP's public key fetched from their DID document.
 * For testing, a locally generated key pair is used.
 */
export function eciesEncrypt(payload: string, beneficiaryPublicKeyPem: string): Buffer {
  // Generate random AES-256 key + IV
  const aesKey = crypto.randomBytes(32);
  const iv     = crypto.randomBytes(12);

  // Encrypt payload with AES-256-GCM
  const cipher  = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
  const enc1    = cipher.update(payload, "utf8");
  const enc2    = cipher.final();
  const authTag = cipher.getAuthTag();
  const encryptedPayload = Buffer.concat([enc1, enc2]);

  // Encrypt AES key with beneficiary's RSA public key
  const encryptedKey = crypto.publicEncrypt(
    { key: beneficiaryPublicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
    aesKey
  );

  // Assemble: keyLen(4) + encKey + iv(12) + tag(16) + encPayload
  const keyLenBuf = Buffer.alloc(4);
  keyLenBuf.writeUInt32BE(encryptedKey.length);
  return Buffer.concat([keyLenBuf, encryptedKey, iv, authTag, encryptedPayload]);
}

export function eciesDecrypt(blob: Buffer, beneficiaryPrivateKeyPem: string): string {
  let offset = 0;
  const keyLen       = blob.readUInt32BE(offset); offset += 4;
  const encryptedKey = blob.slice(offset, offset + keyLen); offset += keyLen;
  const iv           = blob.slice(offset, offset + 12);     offset += 12;
  const authTag      = blob.slice(offset, offset + 16);     offset += 16;
  const encPayload   = blob.slice(offset);

  const aesKey = crypto.privateDecrypt(
    { key: beneficiaryPrivateKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
    encryptedKey
  );

  const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encPayload) + decipher.final("utf8");
}

// ─── Main Upload Entry Point ──────────────────────────────────────────────────

export async function uploadIvms101Payload(
  payload: Ivms101Payload,
  beneficiaryPublicKeyPem: string
): Promise<UploadResult> {
  const json      = JSON.stringify(payload);
  const encrypted = eciesEncrypt(json, beneficiaryPublicKeyPem);

  // Choose provider based on environment
  if (process.env.INFURA_IPFS_PROJECT_ID && process.env.INFURA_IPFS_SECRET) {
    try {
      return await uploadToInfura(encrypted);
    } catch (err) {
      logger.warn("[IPFS] Infura failed, trying Pinata:", (err as Error).message);
    }
  }

  if (process.env.PINATA_JWT) {
    try {
      return await uploadToPinata(encrypted);
    } catch (err) {
      logger.warn("[IPFS] Pinata failed, falling back to mock:", (err as Error).message);
    }
  }

  // Development fallback
  return mockUpload(encrypted);
}

// ─── Name Hash (SHA-256 commitment) ──────────────────────────────────────────
/**
 * Computes the SHA-256 hex digest of a full legal name.
 * This is what gets stored on-chain in originator_name_hash / beneficiary_name_hash.
 * Never store the plaintext name on-chain.
 */
export function hashName(fullLegalName: string): string {
  return crypto.createHash("sha256").update(fullLegalName.trim().toLowerCase()).digest("hex");
}
