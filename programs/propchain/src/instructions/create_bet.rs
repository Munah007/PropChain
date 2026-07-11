use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::errors::PropChainError;
use crate::state::{
    is_valid_stat_key, BetConfig, BetStatus, Comparison, MarketKind, StatOp, VOID_TIMELOCK_SECS,
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateBetArgs {
    pub nonce: u64,
    pub fixture_id: u64,
    pub stat_key_a: u16,
    pub stat_key_b: Option<u16>,
    pub op: Option<StatOp>,
    pub kind: MarketKind,
    pub comparison: Comparison,
    pub threshold: i32,
    pub kickoff_ts: i64,
}

#[derive(Accounts)]
#[instruction(args: CreateBetArgs)]
pub struct CreateBet<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = 8 + BetConfig::INIT_SPACE,
        seeds = [BetConfig::SEED, creator.key().as_ref(), &args.nonce.to_le_bytes()],
        bump
    )]
    pub bet: Account<'info, BetConfig>,

    pub usdc_mint: Account<'info, Mint>,

    /// Escrow vault holding both sides' collateral; authority is the bet PDA.
    #[account(
        init,
        payer = creator,
        seeds = [BetConfig::POOL_SEED, bet.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = bet
    )]
    pub pool: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreateBet>, args: CreateBetArgs) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(args.kickoff_ts > now, PropChainError::KickoffInPast);
    require!(
        is_valid_stat_key(args.stat_key_a),
        PropChainError::InvalidStatKey
    );
    if let Some(key_b) = args.stat_key_b {
        require!(is_valid_stat_key(key_b), PropChainError::InvalidStatKey);
    }
    match args.kind {
        // Line markets: two stats need an op; one stat must not carry one.
        MarketKind::Line => require!(
            args.stat_key_b.is_some() == args.op.is_some(),
            PropChainError::InvalidMarket
        ),
        // GG: exactly two stats, individually compared to zero — no op,
        // and the caller-supplied comparison/threshold are unused.
        MarketKind::BothScore => require!(
            args.stat_key_b.is_some() && args.op.is_none(),
            PropChainError::InvalidMarket
        ),
    }

    let bet = &mut ctx.accounts.bet;
    bet.creator = ctx.accounts.creator.key();
    bet.nonce = args.nonce;
    bet.fixture_id = args.fixture_id;
    bet.stat_key_a = args.stat_key_a;
    bet.stat_key_b = args.stat_key_b;
    bet.op = args.op;
    bet.kind = args.kind;
    bet.comparison = args.comparison;
    bet.threshold = args.threshold;
    bet.kickoff_ts = args.kickoff_ts;
    bet.void_after_ts = args
        .kickoff_ts
        .checked_add(VOID_TIMELOCK_SECS)
        .ok_or(PropChainError::Overflow)?;
    bet.status = BetStatus::Open;
    bet.pending = None;
    bet.result = None;
    bet.over_total = 0;
    bet.under_total = 0;
    bet.usdc_mint = ctx.accounts.usdc_mint.key();
    bet.bump = ctx.bumps.bet;
    bet.pool_bump = ctx.bumps.pool;

    Ok(())
}
