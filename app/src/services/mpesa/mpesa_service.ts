/**
 * MNETI Mobile — M-Pesa Service
 * app/src/services/mpesa/mpesa_service.ts
 *
 * Bridges the React Native app to the MNETI backend M-Pesa APIs.
 * Handles deposit (STK Push), withdrawal (KESH burn → B2C), and remittance.
 */

import axios, { AxiosInstance } from "axios";

// ─── API Client ───────────────────────────────────────────────────────────────

const API_BASE = __DEV__
  ? "http://localhost:4000/api"
  : "https://api.mneti.io/api";

let _api: AxiosInstance | null = null;

function getApi(): AxiosInstance {
  if (!_api) {
    _api = axios.create({
      baseURL: API_BASE,
      timeout: 30_000,
      headers: { "Content-Type": "application/json" },
    });
  }
  return _api;
}

export function setAuthToken(token: string): void {
  if (_api) _api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DepositRequest {
  walletPublicKey: string;
  phoneNumber:     string;   // 2547XXXXXXXX
  amountKes:       number;
}

export interface DepositResponse {
  checkoutRequestId: string;
  merchantRequestId: string;
  message:           string;
}

export interface WithdrawRequest {
  walletPublicKey:  string;
  phoneNumber:      string;
  amountKesh:       number;  // KESH units to burn
}

export interface RemittanceOrderRequest {
  senderName:       string;
  recipientName:    string;
  recipientPhone:   string;
  memo:             string;
  corridorId:       number;
  sourceAmountUsdc: number;
  travelRuleRef?:   string;
  nonce:            number;
}

export interface QueueStats {
  total:      number;
  pending:    number;
  processing: number;
  completed:  number;
  failed:     number;
}

// ─── Deposit (STK Push) ───────────────────────────────────────────────────────

export async function initiateDeposit(req: DepositRequest): Promise<DepositResponse> {
  const resp = await getApi().post<DepositResponse>("/mpesa/deposit", {
    wallet:  req.walletPublicKey,
    phone:   req.phoneNumber,
    amount:  req.amountKes,
  });
  return resp.data;
}

// ─── Withdrawal ───────────────────────────────────────────────────────────────

export async function initiateWithdrawal(req: WithdrawRequest): Promise<{ message: string }> {
  const resp = await getApi().post<{ message: string }>("/mpesa/withdraw", {
    wallet:      req.walletPublicKey,
    phone:       req.phoneNumber,
    amount_kesh: req.amountKesh,
  });
  return resp.data;
}

// ─── Queue Status ─────────────────────────────────────────────────────────────

export async function getQueueStats(): Promise<QueueStats> {
  const resp = await getApi().get<QueueStats>("/mpesa/queue/stats");
  return resp.data;
}

export async function getWalletQueue(walletPublicKey: string): Promise<any[]> {
  const resp = await getApi().get<any[]>(`/mpesa/queue/${walletPublicKey}`);
  return resp.data;
}

// ─── Remittance ───────────────────────────────────────────────────────────────

export async function getRemittanceQuote(corridorId: number, amount: number): Promise<any> {
  const resp = await getApi().get(`/remittance/quote?corridor_id=${corridorId}&amount=${amount}`);
  return resp.data;
}

export async function getRemittanceCorridors(): Promise<any[]> {
  const resp = await getApi().get<any[]>("/remittance/corridors");
  return resp.data;
}

export async function getRemittanceOrderStatus(orderPubkey: string): Promise<any> {
  const resp = await getApi().get(`/remittance/order/${orderPubkey}`);
  return resp.data;
}

// ─── Compliance ───────────────────────────────────────────────────────────────

export async function getComplianceStats(): Promise<any> {
  const resp = await getApi().get("/compliance/stats");
  return resp.data;
}

// ─── Health ───────────────────────────────────────────────────────────────────

export async function getBackendHealth(): Promise<any> {
  const resp = await getApi().get("/health");
  return resp.data;
}

// ─── Validation Helpers ───────────────────────────────────────────────────────

export function validateSafaricomPhone(phone: string): boolean {
  return /^2547\d{8}$/.test(phone);
}

export function formatKes(keshUnits: number): string {
  return `KES ${(keshUnits / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

export function keshToKes(keshUnits: number): number {
  return keshUnits / 100;
}

export function kesToKesh(kes: number): number {
  return Math.round(kes * 100);
}
