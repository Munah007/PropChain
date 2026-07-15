use anchor_lang::prelude::*;

use crate::errors::PropChainError;
use crate::state::{BetConfig, BetStatus};

#[derive(Accounts)]
pub struct FinalizeSettlement<'info> {
    #[account(mut)]
    pub bet: Account<'info, BetConfig>,
}

pub fn handler(ctx: Context<FinalizeSettlement>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let bet = &mut ctx.accounts.bet;

    require!(
        bet.status == BetStatus::SettlementPending,
        PropChainError::NotPending
    );
    let pending = bet.pending.ok_or(PropChainError::NotPending)?;
    require!(
        now >= pending.challenge_deadline_ts,
        PropChainError::ChallengeWindowActive
    );

    // Zero-winner rule: if nobody staked the winning side, void so every
    // position becomes refundable instead of stranding the pool.
    let winning_total = if pending.result { bet.over_total } else { bet.under_total };
    if winning_total == 0 {
        bet.status = BetStatus::Voided;
    } else {
        bet.result = Some(pending.result);
        bet.status = BetStatus::Settled;
    }
    // `bet.pending` is deliberately retained: its proof_ts is the on-chain
    // record of which proof decided the bet, surfaced by the proof viewer.

    emit!(SettlementFinalized {
        bet: bet.key(),
        result: pending.result,
        voided: winning_total == 0,
    });
    Ok(())
}

#[event]
pub struct SettlementFinalized {
    pub bet: Pubkey,
    pub result: bool,
    pub voided: bool,
}
