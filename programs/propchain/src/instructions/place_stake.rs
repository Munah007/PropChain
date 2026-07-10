use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::PropChainError;
use crate::state::{BetConfig, BetStatus, Side, UserPosition};

#[derive(Accounts)]
pub struct PlaceStake<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub bet: Account<'info, BetConfig>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserPosition::INIT_SPACE,
        seeds = [UserPosition::SEED, bet.key().as_ref(), user.key().as_ref()],
        bump
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
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<PlaceStake>, side: Side, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let bet = &mut ctx.accounts.bet;

    require!(bet.status == BetStatus::Open, PropChainError::BetNotOpen);
    require!(now < bet.kickoff_ts, PropChainError::StakingClosed);
    require!(amount > 0, PropChainError::AmountZero);

    let position = &mut ctx.accounts.position;
    if position.amount == 0 {
        // Fresh (or just-initialised) position.
        position.bet = bet.key();
        position.user = ctx.accounts.user.key();
        position.side = side;
        position.claimed = false;
        position.bump = ctx.bumps.position;
    } else {
        // Top-up must stay on the same side.
        require!(position.side == side, PropChainError::SideMismatch);
    }
    position.amount = position
        .amount
        .checked_add(amount)
        .ok_or(PropChainError::Overflow)?;

    match side {
        Side::Over => {
            bet.over_total = bet
                .over_total
                .checked_add(amount)
                .ok_or(PropChainError::Overflow)?;
        }
        Side::Under => {
            bet.under_total = bet
                .under_total
                .checked_add(amount)
                .ok_or(PropChainError::Overflow)?;
        }
    }

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token.to_account_info(),
                to: ctx.accounts.pool.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;

    Ok(())
}
