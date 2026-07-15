use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::PropChainError;
use crate::state::{BetConfig, BetStatus, Side, UserPosition};

#[derive(Accounts)]
pub struct Claim<'info> {
    pub user: Signer<'info>,

    #[account(mut)]
    pub bet: Account<'info, BetConfig>,

    // The PDA seeds bind this position to (bet, user); no extra owner check needed.
    #[account(
        mut,
        seeds = [UserPosition::SEED, bet.key().as_ref(), user.key().as_ref()],
        bump = position.bump
    )]
    pub position: Account<'info, UserPosition>,

    #[account(
        mut,
        seeds = [BetConfig::POOL_SEED, bet.key().as_ref()],
        bump = bet.pool_bump
    )]
    pub pool: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token.mint == bet.usdc_mint,
        constraint = user_token.owner == user.key()
    )]
    pub user_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

/// Pull-based payout. Settled: winners take stake-proportional share of the
/// whole pool (integer floor; dust stays in the vault). Voided: every
/// position reclaims its stake. Double-claim is blocked by the claimed flag.
pub fn handler(ctx: Context<Claim>) -> Result<()> {
    let bet = &ctx.accounts.bet;
    let position = &mut ctx.accounts.position;

    require!(!position.claimed, PropChainError::AlreadyClaimed);

    let payout: u64 = match bet.status {
        BetStatus::Settled => {
            let result = bet.result.ok_or(PropChainError::NotSettled)?;
            let winning_side = if result { Side::Over } else { Side::Under };
            require!(position.side == winning_side, PropChainError::NotAWinner);

            let winning_total = if result { bet.over_total } else { bet.under_total };
            let total_pool = bet
                .over_total
                .checked_add(bet.under_total)
                .ok_or(PropChainError::Overflow)?;
            u64::try_from(
                (position.amount as u128)
                    .checked_mul(total_pool as u128)
                    .ok_or(PropChainError::Overflow)?
                    / (winning_total as u128),
            )
            .map_err(|_| PropChainError::Overflow)?
        }
        BetStatus::Voided => position.amount,
        _ => return err!(PropChainError::NotSettled),
    };

    position.claimed = true;

    let creator = bet.creator;
    let nonce_bytes = bet.nonce.to_le_bytes();
    let signer_seeds: &[&[u8]] = &[BetConfig::SEED, creator.as_ref(), &nonce_bytes, &[bet.bump]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.pool.to_account_info(),
                to: ctx.accounts.user_token.to_account_info(),
                authority: ctx.accounts.bet.to_account_info(),
            },
            &[signer_seeds],
        ),
        payout,
    )?;

    emit!(Claimed {
        bet: ctx.accounts.bet.key(),
        user: ctx.accounts.user.key(),
        amount: payout,
    });
    Ok(())
}

#[event]
pub struct Claimed {
    pub bet: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
}
