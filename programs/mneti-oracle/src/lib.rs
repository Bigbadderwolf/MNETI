use anchor_lang::prelude::*;

declare_id!("4XQ2yp1pxQsypbAQposX1a8jLzFZFbjar28Sf7ruiSRU");

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;
use state::{InitRegistryParams, SubmitPriceParams};

#[program]
pub mod mneti_oracle {
    use super::*;

    pub fn initialize_registry(ctx: Context<InitializeRegistry>, params: InitRegistryParams) -> Result<()> {
        instructions::initialize_registry(ctx, params)
    }

    pub fn initialize_feed(ctx: Context<InitializeFeed>, feed_type: u8) -> Result<()> {
        instructions::initialize_feed(ctx, feed_type)
    }

    pub fn submit_six_price(ctx: Context<SubmitPrice>, feed_type: u8, params: SubmitPriceParams) -> Result<()> {
        instructions::submit_six_price(ctx, feed_type, params)
    }

    pub fn submit_pyth_price(ctx: Context<SubmitPrice>, feed_type: u8, params: SubmitPriceParams) -> Result<()> {
        instructions::submit_pyth_price(ctx, feed_type, params)
    }

    pub fn get_price(ctx: Context<GetPrice>, feed_type: u8) -> Result<PriceResult> {
        instructions::get_price(ctx, feed_type)
    }

    pub fn reset_circuit_breaker(ctx: Context<ResetCircuitBreaker>, feed_type: u8) -> Result<()> {
        instructions::reset_circuit_breaker(ctx, feed_type)
    }

    pub fn update_relay_operator(ctx: Context<UpdateRelayOperator>, new_operator: Pubkey) -> Result<()> {
        instructions::update_relay_operator(ctx, new_operator)
    }
}
