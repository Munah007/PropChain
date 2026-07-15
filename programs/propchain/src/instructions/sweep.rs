use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount, Transfer};

use crate::errors::PropChainError;
use crate::state::{BetConfig, BetStatus, SWEEP_TIMELOCK_SECS};

#[derive(Accounts)]
pub struct Sweep<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        constraint = bet.creator == creator.key() @ PropChainError::NotCreator
    )]
    pub bet: Account<'info, BetConfig>,

    #[account(
        mut,
        seeds = [BetConfig::POOL_SEED, bet.key().as_ref()],
        bump = bet.pool_bump
    )]
    pub pool: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = creator_token.mint == bet.usdc_mint,
        constraint = creator_token.owner == creator.key()
    )]
    pub creator_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

/// After the claim window, the bet creator sweeps whatever is left in the vault
/// — floor-division dust plus any stakes never claimed — to their own account
/// and closes the vault, reclaiming its rent. Gated on a terminal status AND a
/// long timelock past `void_after_ts`, so it can never front-run a winner's
/// claim. The `BetConfig` itself is intentionally left open: it's the on-chain
/// record judges verify the settlement against.
pub fn handler(ctx: Context<Sweep>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let bet = &ctx.accounts.bet;

    require!(
        matches!(bet.status, BetStatus::Settled | BetStatus::Voided),
        PropChainError::NotTerminal
    );
    let sweep_after = bet
        .void_after_ts
        .checked_add(SWEEP_TIMELOCK_SECS)
        .ok_or(PropChainError::Overflow)?;
    require!(now >= sweep_after, PropChainError::SweepTimelockActive);

    let creator = bet.creator;
    let nonce_bytes = bet.nonce.to_le_bytes();
    let signer_seeds: &[&[u8]] = &[BetConfig::SEED, creator.as_ref(), &nonce_bytes, &[bet.bump]];

    let residual = ctx.accounts.pool.amount;
    if residual > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool.to_account_info(),
                    to: ctx.accounts.creator_token.to_account_info(),
                    authority: ctx.accounts.bet.to_account_info(),
                },
                &[signer_seeds],
            ),
            residual,
        )?;
    }

    // Vault is now empty — close it, rent lamports back to the creator.
    token::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.pool.to_account_info(),
            destination: ctx.accounts.creator.to_account_info(),
            authority: ctx.accounts.bet.to_account_info(),
        },
        &[signer_seeds],
    ))?;

    emit!(PoolSwept {
        bet: ctx.accounts.bet.key(),
        residual,
    });
    Ok(())
}

#[event]
pub struct PoolSwept {
    pub bet: Pubkey,
    pub residual: u64,
}
