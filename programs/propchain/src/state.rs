use anchor_lang::prelude::*;

/// Seconds after kickoff at which an unsettled bet may be voided by anyone.
pub const VOID_TIMELOCK_SECS: i64 = 48 * 60 * 60;
/// Challenge window for pending settlements (PRD §5.4).
pub const CHALLENGE_WINDOW_SECS: i64 = 90 * 60;
/// Seconds after `void_after_ts` at which the creator may sweep the vault's
/// residual (rounding dust + any unclaimed stakes) and reclaim its rent. Long
/// enough that a genuine winner always has ample time to claim first.
pub const SWEEP_TIMELOCK_SECS: i64 = 7 * 24 * 60 * 60;

/// The only stake mint the protocol accepts: devnet pUSDC. Hardcoded because
/// the hackathon deployment is devnet-only and single-mint. IMPORTANT: minting
/// a fresh pUSDC (a clean funder state) means updating this constant and
/// redeploying — otherwise `create_bet` will reject every new bet.
pub const PUSDC_MINT: Pubkey =
    anchor_lang::solana_program::pubkey!("DWF9ARTjTq3S2jMabyimsaXiVqGVHnVdp1XoRAh3s6Q8");

/// TxLINE soccer base stat keys: 1/2 goals, 3/4 yellows, 5/6 reds, 7/8 corners
/// (odd = home, even = away). Phase 1 supports full-game stats only.
pub const MAX_STAT_BASE_KEY: u16 = 8;

/// The `period` field on a proven stat is a match-phase marker (observed on
/// real feed data: 2 = 1st half, 3 = halftime, 4 = 2nd half, 5 = stoppage,
/// 100 = game_finalised, 0 = post-final). Settlement proofs are only accepted
/// from final phases — this is the on-chain "match is over" gate.
pub const FINAL_STAT_PERIODS: [i32; 2] = [100, 0];

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Comparison {
    /// Over wins iff stat value (or combination) is strictly greater than threshold.
    Greater,
    /// Over wins iff strictly less. ("Over" always denotes the predicate-true side.)
    Less,
}

/// How two stats combine before the comparison (mirrors the oracle's
/// BinaryExpression). Add → totals; Subtract → margins/winner markets.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum StatOp {
    Add,
    Subtract,
}

/// Market shape. Line = single predicate over one or two combined stats
/// (totals, team totals, winner via Subtract > 0, margins). BothScore = GG:
/// both stats must individually be > 0 (two oracle validations, ANDed).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MarketKind {
    Line,
    BothScore,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Side {
    Over,
    Under,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum BetStatus {
    Open,
    SettlementPending,
    Settled,
    Voided,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub struct PendingSettlement {
    /// Proposed outcome: true = Over (predicate true), false = Under.
    pub result: bool,
    /// TxLINE event timestamp the proof was anchored at. A challenge must
    /// present a strictly greater proof_ts (latest proof wins).
    pub proof_ts: i64,
    /// When the pending result may be finalized.
    pub challenge_deadline_ts: i64,
}

#[account]
#[derive(InitSpace)]
pub struct BetConfig {
    pub creator: Pubkey,
    pub nonce: u64,
    /// TxLINE fixture id (e.g. 18209181).
    pub fixture_id: u64,
    /// TxLINE base stat key (1..=8).
    pub stat_key_a: u16,
    /// Optional second stat key, combined via `op`.
    pub stat_key_b: Option<u16>,
    /// Required iff stat_key_b is present (Line markets).
    pub op: Option<StatOp>,
    pub kind: MarketKind,
    pub comparison: Comparison,
    /// i32 to allow negative margins (oracle predicate range).
    pub threshold: i32,
    /// Fixture kickoff (unix seconds). Staking closes here.
    pub kickoff_ts: i64,
    /// kickoff_ts + VOID_TIMELOCK_SECS; permissionless void allowed after.
    pub void_after_ts: i64,
    pub status: BetStatus,
    pub pending: Option<PendingSettlement>,
    /// Final outcome, set at finalize: true = Over wins.
    pub result: Option<bool>,
    pub over_total: u64,
    pub under_total: u64,
    pub usdc_mint: Pubkey,
    pub bump: u8,
    pub pool_bump: u8,
}

impl BetConfig {
    pub const SEED: &'static [u8] = b"bet";
    pub const POOL_SEED: &'static [u8] = b"pool";
}

#[account]
#[derive(InitSpace)]
pub struct UserPosition {
    pub bet: Pubkey,
    pub user: Pubkey,
    pub side: Side,
    pub amount: u64,
    pub claimed: bool,
    pub bump: u8,
}

impl UserPosition {
    pub const SEED: &'static [u8] = b"position";
}

/// Validates a TxLINE base stat key (Phase 1: full-game stats, keys 1..=8).
pub fn is_valid_stat_key(key: u16) -> bool {
    (1..=MAX_STAT_BASE_KEY).contains(&key)
}
