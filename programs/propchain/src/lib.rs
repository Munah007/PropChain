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

    /// Permissionless: propose (or challenge) a settlement with a TxLINE
    /// Merkle proof. The predicate is built from immutable bet config and
    /// verified via CPI into txoracle's validate_stat. Latest proof wins.
    pub fn propose_settlement(
        ctx: Context<ProposeSettlement>,
        args: ProposeSettlementArgs,
    ) -> Result<()> {
        instructions::propose_settlement::handler(ctx, args)
    }

    /// Permissionless: lock in a pending result once its challenge window
    /// has elapsed. Voids instead if the winning side has no stake.
    pub fn finalize_settlement(ctx: Context<FinalizeSettlement>) -> Result<()> {
        instructions::finalize_settlement::handler(ctx)
    }

    /// Permissionless safety valve: void a never-settled bet after
    /// kickoff + 48h so stakes become refundable.
    pub fn void_bet(ctx: Context<VoidBet>) -> Result<()> {
        instructions::void_bet::handler(ctx)
    }

    /// Pull-based claim: winner payout on settled bets, stake refund on
    /// voided ones.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        instructions::claim::handler(ctx)
    }
}
