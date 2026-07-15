use anchor_lang::prelude::*;

use crate::errors::PropChainError;
use crate::oracle::txoracle::{
    self,
    cpi::accounts::ValidateStat,
    program::Txoracle,
    types::{BinaryExpression, Comparison as OracleComparison, ProofNode, ScoresBatchSummary, StatTerm, TraderPredicate},
};
use crate::state::{
    BetConfig, BetStatus, Comparison, MarketKind, PendingSettlement, StatOp,
    CHALLENGE_WINDOW_SECS, FINAL_STAT_PERIODS,
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ProposeSettlementArgs {
    /// Timestamp (ms) used by the oracle to locate the interval root.
    pub ts: i64,
    pub fixture_summary: ScoresBatchSummary,
    pub fixture_proof: Vec<ProofNode>,
    pub main_tree_proof: Vec<ProofNode>,
    pub stat_a: StatTerm,
    pub stat_b: Option<StatTerm>,
}

#[derive(Accounts)]
pub struct ProposeSettlement<'info> {
    pub proposer: Signer<'info>,

    #[account(mut)]
    pub bet: Account<'info, BetConfig>,

    /// CHECK: daily scores Merkle roots PDA; its integrity is enforced by the
    /// txoracle program during validate_stat.
    pub daily_scores_merkle_roots: UncheckedAccount<'info>,

    pub txoracle_program: Program<'info, Txoracle>,
}

/// A proven stat is acceptable iff it is the bet's exact stat AND comes from
/// a final match phase (period 100 = game_finalised, 0 = post-final). The
/// phase gate makes settlement on mid-match state impossible by construction;
/// the challenge window then only has to absorb post-final corrections.
fn check_stat_binding(stat: &StatTerm, expected_key: u16) -> Result<()> {
    require!(
        stat.stat_to_prove.key == expected_key as u32,
        PropChainError::StatKeyMismatch
    );
    require!(
        FINAL_STAT_PERIODS.contains(&stat.stat_to_prove.period),
        PropChainError::ProofNotFinal
    );
    Ok(())
}

pub fn handler(ctx: Context<ProposeSettlement>, args: ProposeSettlementArgs) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let bet = &mut ctx.accounts.bet;

    require!(
        matches!(bet.status, BetStatus::Open | BetStatus::SettlementPending),
        PropChainError::BetNotOpen
    );
    require!(now >= bet.kickoff_ts, PropChainError::KickoffNotReached);

    // The proof must be about this bet's fixture…
    require!(
        args.fixture_summary.fixture_id == bet.fixture_id as i64,
        PropChainError::FixtureMismatch
    );
    // …and about this bet's exact stat(s), in a final match phase. The oracle
    // proves whatever stat it is handed; binding it to the immutable bet
    // config is on us.
    check_stat_binding(&args.stat_a, bet.stat_key_a)?;
    match bet.stat_key_b {
        Some(key_b) => {
            let stat_b = args.stat_b.as_ref().ok_or(PropChainError::StatKeyMismatch)?;
            check_stat_binding(stat_b, key_b)?;
        }
        None => require!(args.stat_b.is_none(), PropChainError::StatKeyMismatch),
    }

    // Latest proof wins: a challenge must be anchored at a strictly later
    // event timestamp than the pending proposal. max_timestamp is part of the
    // Merkle-validated summary, so it cannot be forged.
    // (Assumption, verified against recorded feeds: later match events land in
    // batches with strictly greater max_timestamp. Trailing feed events after
    // full time mean a final batch always exists to overturn stale proposals.)
    let proof_ts = args.fixture_summary.update_stats.max_timestamp;
    if let Some(pending) = &bet.pending {
        require!(proof_ts > pending.proof_ts, PropChainError::ProofNotLater);
    }

    // Predicates come from immutable bet config — never from the caller.
    let validate = |predicate: TraderPredicate,
                    stat_a: StatTerm,
                    stat_b: Option<StatTerm>,
                    op: Option<BinaryExpression>|
     -> Result<bool> {
        Ok(txoracle::cpi::validate_stat(
            CpiContext::new(
                ctx.accounts.txoracle_program.to_account_info(),
                ValidateStat {
                    daily_scores_merkle_roots: ctx
                        .accounts
                        .daily_scores_merkle_roots
                        .to_account_info(),
                },
            ),
            args.ts,
            args.fixture_summary.clone(),
            args.fixture_proof.clone(),
            args.main_tree_proof.clone(),
            predicate,
            stat_a,
            stat_b,
            op,
        )?
        .get())
    };

    let verdict = match bet.kind {
        MarketKind::Line => {
            let predicate = TraderPredicate {
                threshold: bet.threshold,
                comparison: match bet.comparison {
                    Comparison::Greater => OracleComparison::GreaterThan,
                    Comparison::Less => OracleComparison::LessThan,
                },
            };
            let op = bet.op.map(|o| match o {
                StatOp::Add => BinaryExpression::Add,
                StatOp::Subtract => BinaryExpression::Subtract,
            });
            validate(predicate, args.stat_a, args.stat_b, op)?
        }
        // GG: each team's stat must individually exceed zero. Two proofs,
        // two oracle validations, ANDed by this program.
        MarketKind::BothScore => {
            let gt_zero = || TraderPredicate {
                threshold: 0,
                comparison: OracleComparison::GreaterThan,
            };
            let stat_b = args.stat_b.ok_or(PropChainError::StatKeyMismatch)?;
            let a_scored = validate(gt_zero(), args.stat_a, None, None)?;
            let b_scored = validate(gt_zero(), stat_b, None, None)?;
            a_scored && b_scored
        }
    };

    let challenge_deadline_ts = now
        .checked_add(CHALLENGE_WINDOW_SECS)
        .ok_or(PropChainError::Overflow)?;
    bet.pending = Some(PendingSettlement {
        result: verdict,
        proof_ts,
        challenge_deadline_ts,
    });
    bet.status = BetStatus::SettlementPending;

    emit!(SettlementProposed {
        bet: bet.key(),
        proposer: ctx.accounts.proposer.key(),
        result: verdict,
        proof_ts,
        challenge_deadline_ts,
    });
    Ok(())
}

#[event]
pub struct SettlementProposed {
    pub bet: Pubkey,
    pub proposer: Pubkey,
    pub result: bool,
    pub proof_ts: i64,
    pub challenge_deadline_ts: i64,
}
