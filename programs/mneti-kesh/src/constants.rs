pub const KESH_DECIMALS:               u8    = 2;
pub const MIN_DEPOSIT_KES:             u64   = 5_000;
pub const MAX_ORACLE_AGE_SECONDS:      i64   = 60;
pub const DEFAULT_FEE_BPS:             u16   = 30;
pub const BPS_DENOMINATOR:             u64   = 10_000;
pub const SECONDS_IN_DAY:              i64   = 86_400;
pub const TIER0_DAILY_LIMIT_USD_CENTS: u64   = 10_000;
pub const TIER1_DAILY_LIMIT_USD_CENTS: u64   = 1_000_000;
pub const TIER2_DAILY_LIMIT_USD_CENTS: u64   = 100_000_000;

pub const PROTOCOL_STATE_SEED: &[u8] = b"protocol_state";
pub const MINT_AUTHORITY_SEED: &[u8] = b"mint_authority";
pub const BRIDGE_DEPOSIT_SEED: &[u8] = b"bridge_deposit";
pub const WALLET_STATE_SEED:   &[u8] = b"wallet_state";
