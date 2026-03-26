use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::OracleError;
use crate::events::*;
use crate::state::*;

pub fn initialize_registry(ctx: Context<InitializeRegistry>, params: InitRegistryParams) -> Result<()> {
    let now      = Clock::get()?.unix_timestamp;
    let registry = &mut ctx.accounts.oracle_registry;
    registry.authority      = ctx.accounts.authority.key();
    registry.relay_operator = params.relay_operator;
    registry.total_feeds    = 0;
    registry.is_paused      = false;
    registry.initialized_at = now;
    registry.bump           = ctx.bumps.oracle_registry;
    emit!(OracleRegistryInitialized { authority: ctx.accounts.authority.key(), timestamp: now });
    msg!("Oracle registry initialized. Relay: {}", params.relay_operator);
    Ok(())
}

pub fn initialize_feed(ctx: Context<InitializeFeed>, feed_type: u8) -> Result<()> {
    require!(feed_type <= 4, OracleError::InvalidFeedType);
    let now  = Clock::get()?.unix_timestamp;
    let feed = &mut ctx.accounts.price_feed;
    feed.feed_type              = feed_type;
    feed.six_price              = 0;
    feed.six_confidence         = 0;
    feed.six_last_update        = 0;
    feed.six_update_count       = 0;
    feed.pyth_price             = 0;
    feed.pyth_confidence        = 0;
    feed.pyth_last_update       = 0;
    feed.pyth_is_active_source  = false;
    feed.twap_buffer            = [0u64; 10];
    feed.twap_index             = 0;
    feed.twap                   = 0;
    feed.circuit_breaker_active = false;
    feed.last_deviation_bps     = 0;
    feed.circuit_breaker_at     = 0;
    feed.initialized_at         = now;
    feed.bump                   = ctx.bumps.price_feed;
    ctx.accounts.oracle_registry.total_feeds =
        ctx.accounts.oracle_registry.total_feeds.saturating_add(1);
    emit!(FeedInitialized { feed_type, relay: ctx.accounts.authority.key(), timestamp: now });
    msg!("Feed initialized: type {}", feed_type);
    Ok(())
}

pub fn submit_six_price(ctx: Context<SubmitPrice>, feed_type: u8, params: SubmitPriceParams) -> Result<()> {
    let now      = Clock::get()?.unix_timestamp;
    let registry = &ctx.accounts.oracle_registry;
    let feed     = &mut ctx.accounts.price_feed;
    require!(!registry.is_paused, OracleError::CircuitBreakerActive);
    require!(ctx.accounts.relay_operator.key() == registry.relay_operator, OracleError::Unauthorized);
    require!(params.price > 0, OracleError::InvalidPrice);
    require!(feed_type == feed.feed_type, OracleError::InvalidFeedType);

    let old_price = feed.six_price;

    // Circuit breaker check against Pyth
    let pyth_fresh = now - feed.pyth_last_update <= MAX_PRICE_AGE_SECONDS;
    if pyth_fresh && feed.pyth_price > 0 {
        let diff = if params.price > feed.pyth_price
            { params.price - feed.pyth_price } else { feed.pyth_price - params.price };
        let deviation_bps = diff.saturating_mul(BPS_DENOMINATOR).saturating_div(params.price);
        if deviation_bps > MAX_DEVIATION_BPS {
            feed.circuit_breaker_active = true;
            feed.last_deviation_bps     = deviation_bps;
            feed.circuit_breaker_at     = now;
            emit!(CircuitBreakerTriggered {
                feed_type, six_price: params.price,
                pyth_price: feed.pyth_price, deviation_bps, timestamp: now });
            return err!(OracleError::PriceDeviationTooLarge);
        }
    }

    feed.six_price              = params.price;
    feed.six_confidence         = params.confidence;
    feed.six_last_update        = now;
    feed.six_update_count       = feed.six_update_count.saturating_add(1);
    feed.pyth_is_active_source  = false;
    feed.circuit_breaker_active = false;
    feed.update_twap(params.price);

    emit!(PriceUpdated { feed_type, old_price, new_price: params.price,
        confidence: params.confidence, new_twap: feed.twap,
        source: "SIX".to_string(), timestamp: now });
    Ok(())
}

pub fn submit_pyth_price(ctx: Context<SubmitPrice>, feed_type: u8, params: SubmitPriceParams) -> Result<()> {
    let now      = Clock::get()?.unix_timestamp;
    let registry = &ctx.accounts.oracle_registry;
    let feed     = &mut ctx.accounts.price_feed;
    require!(!registry.is_paused, OracleError::CircuitBreakerActive);
    require!(ctx.accounts.relay_operator.key() == registry.relay_operator, OracleError::Unauthorized);
    require!(params.price > 0, OracleError::InvalidPrice);
    require!(feed_type == feed.feed_type, OracleError::InvalidFeedType);

    let old_pyth              = feed.pyth_price;
    feed.pyth_price           = params.price;
    feed.pyth_confidence      = params.confidence;
    feed.pyth_last_update     = now;
    feed.pyth_is_active_source = true;

    let six_stale = now - feed.six_last_update > MAX_PRICE_AGE_SECONDS;
    if six_stale { feed.update_twap(params.price); }

    emit!(FallbackActivated { feed_type, reason: "SIX stale > 60s".to_string(),
        pyth_price: params.price, timestamp: now });
    emit!(PriceUpdated { feed_type, old_price: old_pyth, new_price: params.price,
        confidence: params.confidence, new_twap: feed.twap,
        source: "PYTH".to_string(), timestamp: now });
    Ok(())
}

pub fn get_price(ctx: Context<GetPrice>, feed_type: u8) -> Result<PriceResult> {
    let now  = Clock::get()?.unix_timestamp;
    let feed = &ctx.accounts.price_feed;
    require!(!feed.circuit_breaker_active, OracleError::CircuitBreakerActive);
    require!(feed_type == feed.feed_type, OracleError::InvalidFeedType);
    let (price, is_fallback) = feed.get_best_price(now);
    require!(price > 0, OracleError::StalePrice);
    Ok(PriceResult {
        price,
        confidence:  if is_fallback { feed.pyth_confidence } else { feed.six_confidence },
        twap:        feed.twap,
        is_fallback,
        is_stale:    now - feed.six_last_update > MAX_PRICE_AGE_SECONDS,
        timestamp:   now,
    })
}

pub fn reset_circuit_breaker(ctx: Context<ResetCircuitBreaker>, feed_type: u8) -> Result<()> {
    let now  = Clock::get()?.unix_timestamp;
    let feed = &mut ctx.accounts.price_feed;
    require!(feed_type == feed.feed_type, OracleError::InvalidFeedType);
    feed.circuit_breaker_active = false;
    feed.last_deviation_bps     = 0;
    emit!(CircuitBreakerReset { feed_type, reset_by: ctx.accounts.authority.key(), timestamp: now });
    Ok(())
}

pub fn update_relay_operator(ctx: Context<UpdateRelayOperator>, new_operator: Pubkey) -> Result<()> {
    ctx.accounts.oracle_registry.relay_operator = new_operator;
    msg!("Relay operator updated to {}", new_operator);
    Ok(())
}

// ── RETURN TYPE ───────────────────────────────────────────────
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PriceResult {
    pub price:       u64,
    pub confidence:  u64,
    pub twap:        u64,
    pub is_fallback: bool,
    pub is_stale:    bool,
    pub timestamp:   i64,
}

// ── ACCOUNT CONTEXTS ─────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeRegistry<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = OracleRegistry::LEN,
        seeds = [ORACLE_REGISTRY_SEED], bump)]
    pub oracle_registry: Account<'info, OracleRegistry>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(feed_type: u8)]
pub struct InitializeFeed<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [ORACLE_REGISTRY_SEED], bump = oracle_registry.bump,
        constraint = authority.key() == oracle_registry.authority @ OracleError::Unauthorized)]
    pub oracle_registry: Account<'info, OracleRegistry>,
    #[account(init, payer = authority, space = PriceFeed::LEN,
        seeds = [PRICE_FEED_SEED, &[feed_type]], bump)]
    pub price_feed: Account<'info, PriceFeed>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(feed_type: u8)]
pub struct SubmitPrice<'info> {
    pub relay_operator: Signer<'info>,
    #[account(seeds = [ORACLE_REGISTRY_SEED], bump = oracle_registry.bump)]
    pub oracle_registry: Account<'info, OracleRegistry>,
    #[account(mut, seeds = [PRICE_FEED_SEED, &[feed_type]], bump = price_feed.bump)]
    pub price_feed: Account<'info, PriceFeed>,
}

#[derive(Accounts)]
#[instruction(feed_type: u8)]
pub struct GetPrice<'info> {
    #[account(seeds = [PRICE_FEED_SEED, &[feed_type]], bump = price_feed.bump)]
    pub price_feed: Account<'info, PriceFeed>,
}

#[derive(Accounts)]
#[instruction(feed_type: u8)]
pub struct ResetCircuitBreaker<'info> {
    #[account(constraint = authority.key() == oracle_registry.authority
        @ OracleError::Unauthorized)]
    pub authority: Signer<'info>,
    #[account(seeds = [ORACLE_REGISTRY_SEED], bump = oracle_registry.bump)]
    pub oracle_registry: Account<'info, OracleRegistry>,
    #[account(mut, seeds = [PRICE_FEED_SEED, &[feed_type]], bump = price_feed.bump)]
    pub price_feed: Account<'info, PriceFeed>,
}

#[derive(Accounts)]
pub struct UpdateRelayOperator<'info> {
    #[account(constraint = authority.key() == oracle_registry.authority
        @ OracleError::Unauthorized)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [ORACLE_REGISTRY_SEED], bump = oracle_registry.bump)]
    pub oracle_registry: Account<'info, OracleRegistry>,
}
