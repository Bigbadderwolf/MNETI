/**
 * MNETI Mobile — Global State Store
 * app/src/store/index.ts
 *
 * Zustand store managing:
 *   - Wallet connection state
 *   - KYC / compliance credential state
 *   - Vault balances
 *   - Remittance corridor rates
 *   - Network connectivity
 *   - User preferences
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WalletState {
  publicKey:   string | null;
  connected:   boolean;
  kycTier:     number;          // 0=none, 1=basic, 2=enhanced, 3=full
  isFrozen:    boolean;
  creditScore: number | null;   // 300–850
}

export interface VaultBalance {
  vaultType:      number;       // 0=individual,1=chama,2=sme,3=enterprise,4=ngo
  balanceKesh:    number;       // KESH units (2 decimals)
  accruedYield:   number;
  lastUpdated:    number;       // unix timestamp
}

export interface RemittanceQuote {
  corridorId:          number;
  sourceCurrency:      string;
  destCurrency:        string;
  sourceAmount:        number;
  destAmountKesh:      number;
  feeAmount:           number;
  fxRate:              number;
  travelRuleRequired:  boolean;
  expiresAt:           number;
}

export interface NotificationItem {
  id:        string;
  type:      "success" | "error" | "info" | "warning";
  title:     string;
  message:   string;
  timestamp: number;
  read:      boolean;
}

export interface AppPreferences {
  currency:    "KES" | "USD" | "GBP";
  language:    "en" | "sw";              // English / Swahili
  biometrics:  boolean;
  darkMode:    boolean;
  pushNotifs:  boolean;
}

// ─── Store Definition ─────────────────────────────────────────────────────────

interface MnetiStore {
  // Wallet
  wallet:          WalletState;
  setWallet:       (w: Partial<WalletState>) => void;
  disconnectWallet:() => void;

  // Vaults
  vaults:          VaultBalance[];
  setVaults:       (v: VaultBalance[]) => void;
  updateVault:     (type: number, data: Partial<VaultBalance>) => void;

  // Remittance
  currentQuote:    RemittanceQuote | null;
  setQuote:        (q: RemittanceQuote | null) => void;

  // Notifications
  notifications:   NotificationItem[];
  addNotification: (n: Omit<NotificationItem, "id" | "timestamp" | "read">) => void;
  markRead:        (id: string) => void;
  clearNotifs:     () => void;

  // Preferences
  prefs:           AppPreferences;
  setPrefs:        (p: Partial<AppPreferences>) => void;

  // Network
  isOnline:        boolean;
  setOnline:       (online: boolean) => void;

  // Loading states
  loading:         Record<string, boolean>;
  setLoading:      (key: string, val: boolean) => void;
}

export const useMnetiStore = create<MnetiStore>()(
  persist(
    (set, get) => ({
      // ── Wallet ───────────────────────────────────────────────────────────────
      wallet: {
        publicKey:   null,
        connected:   false,
        kycTier:     0,
        isFrozen:    false,
        creditScore: null,
      },
      setWallet: (w) =>
        set((s) => ({ wallet: { ...s.wallet, ...w } })),
      disconnectWallet: () =>
        set({ wallet: { publicKey: null, connected: false, kycTier: 0, isFrozen: false, creditScore: null } }),

      // ── Vaults ───────────────────────────────────────────────────────────────
      vaults: [],
      setVaults: (v) => set({ vaults: v }),
      updateVault: (type, data) =>
        set((s) => ({
          vaults: s.vaults.map((v) =>
            v.vaultType === type ? { ...v, ...data } : v
          ),
        })),

      // ── Remittance ───────────────────────────────────────────────────────────
      currentQuote: null,
      setQuote: (q) => set({ currentQuote: q }),

      // ── Notifications ─────────────────────────────────────────────────────────
      notifications: [],
      addNotification: (n) =>
        set((s) => ({
          notifications: [
            {
              ...n,
              id:        `notif_${Date.now()}`,
              timestamp: Date.now(),
              read:      false,
            },
            ...s.notifications.slice(0, 49), // keep last 50
          ],
        })),
      markRead: (id) =>
        set((s) => ({
          notifications: s.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        })),
      clearNotifs: () => set({ notifications: [] }),

      // ── Preferences ───────────────────────────────────────────────────────────
      prefs: {
        currency:   "KES",
        language:   "en",
        biometrics: false,
        darkMode:   false,
        pushNotifs: true,
      },
      setPrefs: (p) => set((s) => ({ prefs: { ...s.prefs, ...p } })),

      // ── Network ───────────────────────────────────────────────────────────────
      isOnline: true,
      setOnline: (online) => set({ isOnline: online }),

      // ── Loading ───────────────────────────────────────────────────────────────
      loading: {},
      setLoading: (key, val) =>
        set((s) => ({ loading: { ...s.loading, [key]: val } })),
    }),
    {
      name:    "mneti-app-state",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        wallet: s.wallet,
        prefs:  s.prefs,
        // Don't persist: vaults, quote, notifications (always re-fetched)
      }),
    }
  )
);

// ─── Selectors ─────────────────────────────────────────────────────────────────

export const selectWallet        = (s: MnetiStore) => s.wallet;
export const selectIsConnected   = (s: MnetiStore) => s.wallet.connected;
export const selectKycTier       = (s: MnetiStore) => s.wallet.kycTier;
export const selectVaults        = (s: MnetiStore) => s.vaults;
export const selectNotifications = (s: MnetiStore) => s.notifications;
export const selectUnreadCount   = (s: MnetiStore) => s.notifications.filter(n => !n.read).length;
export const selectPrefs         = (s: MnetiStore) => s.prefs;
export const selectIsOnline      = (s: MnetiStore) => s.isOnline;
export const selectLoading       = (key: string) => (s: MnetiStore) => s.loading[key] ?? false;
