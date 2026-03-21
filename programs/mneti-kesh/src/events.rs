use anchor_lang::prelude::*;

#[event]
pub struct KeshMinted {
    pub wallet:      Pubkey,
    pub mpesa_ref:   String,
    pub kes_amount:  u64,
    pub kesh_minted: u64,
    pub rate_used:   u64,
    pub fee_charged: u64,
    pub timestamp:   i64,
}

#[event]
pub struct KeshBurned {
    pub wallet:         Pubkey,
    pub kesh_burned:    u64,
    pub kes_to_release: u64,
    pub fee_charged:    u64,
    pub timestamp:      i64,
}

#[event]
pub struct PegUpdated {
    pub old_rate:        u64,
    pub new_rate:        u64,
    pub tbill_yield_bps: u16,
    pub source:          String,
    pub timestamp:       i64,
}

#[event]
pub struct ProtocolPaused {
    pub paused_by: Pubkey,
    pub reason:    String,
    pub timestamp: i64,
}

#[event]
pub struct ProtocolUnpaused {
    pub unpaused_by: Pubkey,
    pub timestamp:   i64,
}
