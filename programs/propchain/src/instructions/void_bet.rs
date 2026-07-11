use anchor_lang::prelude::*;

use crate::errors::PropChainError;
use crate::state::{BetConfig, BetStatus};

#[derive(Accounts)]
pub struct VoidBet<'info> {
    #[account(mut)]
    pub bet: Account<'info, BetConfig>,
}

/// Permissionless safety valve: if no settlement was ever proposed and the
/// timelock (kickoff + 48h) has lapsed, anyone can void so stakes become
/// refundable. Deliberately NOT allowed while a settlement is pending — a
/// pending proposal always reaches finalize_settlement once its challenge
/// window elapses, so voiding it would only serve griefing.
pub fn handler(ctx: Context<VoidBet>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let bet = &mut ctx.accounts.bet;

    require!(bet.status == BetStatus::Open, PropChainError::NotVoidable);
    require!(now >= bet.void_after_ts, PropChainError::VoidTimelockActive);

    bet.status = BetStatus::Voided;

    emit!(BetVoided { bet: bet.key() });
    Ok(())
}

#[event]
pub struct BetVoided {
    pub bet: Pubkey,
}
