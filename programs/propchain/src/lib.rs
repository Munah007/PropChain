use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;
use state::Side;

/// TxLINE txoracle CPI interface (devnet IDL, pubkey constants stripped —
/// they break declare_program! codegen). Used by propose_settlement.
pub mod oracle {
    use anchor_lang::declare_program;
    declare_program!(txoracle);
}

declare_id!("3HwBzjvoM663GwMSveXdNNFVaQ4JdNxQAyAxEdZv7MJU");

#[program]
pub mod propchain {
    use super::*;

    /// Create a prop bet: fixture + period-encoded stat key(s) + strict
    /// comparison + integer threshold. Staking closes at kickoff.
    pub fn create_bet(ctx: Context<CreateBet>, args: CreateBetArgs) -> Result<()> {
        instructions::create_bet::handler(ctx, args)
    }

    /// Stake USDC on Over or Under. One side per user per bet; top-ups
    /// must stay on the same side.
    pub fn place_stake(ctx: Context<PlaceStake>, side: Side, amount: u64) -> Result<()> {
        instructions::place_stake::handler(ctx, side, amount)
    }

    // Day 2 (PRD §5.3): propose_settlement (validate_stat CPI, latest-proof-wins),
    // finalize_settlement (challenge window + zero-winner rule).
    // Day 3: void_bet (kickoff + 48h timelock), claim (pull-based payouts/refunds).
}
