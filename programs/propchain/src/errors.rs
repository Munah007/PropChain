use anchor_lang::prelude::*;

#[error_code]
pub enum PropChainError {
    #[msg("Kickoff must be in the future")]
    KickoffInPast,
    #[msg("Invalid TxLINE stat key")]
    InvalidStatKey,
    #[msg("Bet is not open for staking")]
    BetNotOpen,
    #[msg("Staking closed at kickoff")]
    StakingClosed,
    #[msg("Stake amount must be greater than zero")]
    AmountZero,
    #[msg("Position already exists on the other side")]
    SideMismatch,
    #[msg("Proof fixture does not match this bet")]
    FixtureMismatch,
    #[msg("Proven stat key does not match this bet")]
    StatKeyMismatch,
    #[msg("Proof is not from a final match phase")]
    ProofNotFinal,
    #[msg("Invalid market configuration")]
    InvalidMarket,
    #[msg("Challenge proof must be strictly later than the pending one")]
    ProofNotLater,
    #[msg("Challenge window has not elapsed")]
    ChallengeWindowActive,
    #[msg("Bet is not pending settlement")]
    NotPending,
    #[msg("Void timelock has not elapsed")]
    VoidTimelockActive,
    #[msg("Bet cannot be voided in its current status")]
    NotVoidable,
    #[msg("Bet is not settled")]
    NotSettled,
    #[msg("Position is on the losing side")]
    NotAWinner,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Stake mint is not the accepted pUSDC mint")]
    InvalidMint,
    #[msg("Only the bet creator may sweep")]
    NotCreator,
    #[msg("Bet is not in a terminal (settled/voided) state")]
    NotTerminal,
    #[msg("Sweep timelock has not elapsed")]
    SweepTimelockActive,
    #[msg("Arithmetic overflow")]
    Overflow,
}
