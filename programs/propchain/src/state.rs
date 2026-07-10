use anchor_lang::prelude::*;

/// Seconds after kickoff at which an unsettled bet may be voided by anyone.
pub const VOID_TIMELOCK_SECS: i64 = 48 * 60 * 60;
/// Challenge window for pending settlements (PRD §5.4).
pub const CHALLENGE_WINDOW_SECS: i64 = 90 * 60;

/// TxLINE soccer base stat keys: 1/2 goals, 3/4 yellows, 5/6 reds, 7/8 corners
/// (odd = home, even = away). Full key = period * 1000 + base, period 0..=5.
pub const MAX_STAT_BASE_KEY: u16 = 8;
pub const MAX_STAT_PERIOD: u16 = 5;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Comparison {
    /// Over wins iff stat value (or sum) is strictly greater than threshold.
    Greater,
    /// Over wins iff strictly less. ("Over" always denotes the predicate-true side.)
    Less,
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
    /// Period-encoded TxLINE stat key.
    pub stat_key_a: u16,
    /// Optional second stat key; when present the predicate is Add(a, b).
    pub stat_key_b: Option<u16>,
    pub comparison: Comparison,
    pub threshold: u32,
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

/// Validates a period-encoded TxLINE stat key: period * 1000 + base_key,
/// base_key in 1..=8, period in 0..=5.
pub fn is_valid_stat_key(key: u16) -> bool {
    let base = key % 1000;
    let period = key / 1000;
    (1..=MAX_STAT_BASE_KEY).contains(&base) && period <= MAX_STAT_PERIOD
}
