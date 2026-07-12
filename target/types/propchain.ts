/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/propchain.json`.
 */
export type Propchain = {
  "address": "3HwBzjvoM663GwMSveXdNNFVaQ4JdNxQAyAxEdZv7MJU",
  "metadata": {
    "name": "propchain",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Parametric prop-bet protocol on Solana, settled by TxLINE Merkle proofs"
  },
  "instructions": [
    {
      "name": "claim",
      "docs": [
        "Pull-based claim: winner payout on settled bets, stake refund on",
        "voided ones."
      ],
      "discriminator": [
        62,
        198,
        214,
        193,
        213,
        159,
        108,
        210
      ],
      "accounts": [
        {
          "name": "user",
          "signer": true
        },
        {
          "name": "bet",
          "writable": true
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "bet"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "bet"
              }
            ]
          }
        },
        {
          "name": "userToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "createBet",
      "docs": [
        "Create a prop bet: fixture + period-encoded stat key(s) + strict",
        "comparison + integer threshold. Staking closes at kickoff."
      ],
      "discriminator": [
        197,
        42,
        153,
        2,
        59,
        63,
        143,
        246
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "bet",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "arg",
                "path": "args.nonce"
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "pool",
          "docs": [
            "Escrow vault holding both sides' collateral; authority is the bet PDA."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "bet"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "createBetArgs"
            }
          }
        }
      ]
    },
    {
      "name": "finalizeSettlement",
      "docs": [
        "Permissionless: lock in a pending result once its challenge window",
        "has elapsed. Voids instead if the winning side has no stake."
      ],
      "discriminator": [
        220,
        72,
        152,
        119,
        178,
        196,
        25,
        170
      ],
      "accounts": [
        {
          "name": "bet",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "placeStake",
      "docs": [
        "Stake USDC on Over or Under. One side per user per bet; top-ups",
        "must stay on the same side."
      ],
      "discriminator": [
        22,
        66,
        171,
        110,
        117,
        28,
        158,
        57
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "bet",
          "writable": true
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "bet"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "bet"
              }
            ]
          }
        },
        {
          "name": "userToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "side",
          "type": {
            "defined": {
              "name": "side"
            }
          }
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "proposeSettlement",
      "docs": [
        "Permissionless: propose (or challenge) a settlement with a TxLINE",
        "Merkle proof. The predicate is built from immutable bet config and",
        "verified via CPI into txoracle's validate_stat. Latest proof wins."
      ],
      "discriminator": [
        228,
        149,
        56,
        61,
        137,
        43,
        106,
        25
      ],
      "accounts": [
        {
          "name": "proposer",
          "signer": true
        },
        {
          "name": "bet",
          "writable": true
        },
        {
          "name": "dailyScoresMerkleRoots",
          "docs": [
            "txoracle program during validate_stat."
          ]
        },
        {
          "name": "txoracleProgram",
          "address": "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "proposeSettlementArgs"
            }
          }
        }
      ]
    },
    {
      "name": "voidBet",
      "docs": [
        "Permissionless safety valve: void a never-settled bet after",
        "kickoff + 48h so stakes become refundable."
      ],
      "discriminator": [
        36,
        30,
        28,
        196,
        66,
        16,
        242,
        53
      ],
      "accounts": [
        {
          "name": "bet",
          "writable": true
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "betConfig",
      "discriminator": [
        116,
        136,
        243,
        255,
        142,
        203,
        43,
        211
      ]
    },
    {
      "name": "userPosition",
      "discriminator": [
        251,
        248,
        209,
        245,
        83,
        234,
        17,
        27
      ]
    }
  ],
  "events": [
    {
      "name": "betVoided",
      "discriminator": [
        216,
        148,
        125,
        143,
        72,
        172,
        152,
        77
      ]
    },
    {
      "name": "claimed",
      "discriminator": [
        217,
        192,
        123,
        72,
        108,
        150,
        248,
        33
      ]
    },
    {
      "name": "settlementFinalized",
      "discriminator": [
        95,
        186,
        111,
        179,
        117,
        162,
        152,
        217
      ]
    },
    {
      "name": "settlementProposed",
      "discriminator": [
        139,
        32,
        64,
        205,
        27,
        154,
        100,
        147
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "kickoffInPast",
      "msg": "Kickoff must be in the future"
    },
    {
      "code": 6001,
      "name": "invalidStatKey",
      "msg": "Invalid TxLINE stat key"
    },
    {
      "code": 6002,
      "name": "betNotOpen",
      "msg": "Bet is not open for staking"
    },
    {
      "code": 6003,
      "name": "stakingClosed",
      "msg": "Staking closed at kickoff"
    },
    {
      "code": 6004,
      "name": "amountZero",
      "msg": "Stake amount must be greater than zero"
    },
    {
      "code": 6005,
      "name": "sideMismatch",
      "msg": "Position already exists on the other side"
    },
    {
      "code": 6006,
      "name": "fixtureMismatch",
      "msg": "Proof fixture does not match this bet"
    },
    {
      "code": 6007,
      "name": "statKeyMismatch",
      "msg": "Proven stat key does not match this bet"
    },
    {
      "code": 6008,
      "name": "proofNotFinal",
      "msg": "Proof is not from a final match phase"
    },
    {
      "code": 6009,
      "name": "invalidMarket",
      "msg": "Invalid market configuration"
    },
    {
      "code": 6010,
      "name": "proofNotLater",
      "msg": "Challenge proof must be strictly later than the pending one"
    },
    {
      "code": 6011,
      "name": "challengeWindowActive",
      "msg": "Challenge window has not elapsed"
    },
    {
      "code": 6012,
      "name": "notPending",
      "msg": "Bet is not pending settlement"
    },
    {
      "code": 6013,
      "name": "voidTimelockActive",
      "msg": "Void timelock has not elapsed"
    },
    {
      "code": 6014,
      "name": "notVoidable",
      "msg": "Bet cannot be voided in its current status"
    },
    {
      "code": 6015,
      "name": "notSettled",
      "msg": "Bet is not settled"
    },
    {
      "code": 6016,
      "name": "notAWinner",
      "msg": "Position is on the losing side"
    },
    {
      "code": 6017,
      "name": "alreadyClaimed",
      "msg": "Already claimed"
    },
    {
      "code": 6018,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "betConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "fixtureId",
            "docs": [
              "TxLINE fixture id (e.g. 18209181)."
            ],
            "type": "u64"
          },
          {
            "name": "statKeyA",
            "docs": [
              "TxLINE base stat key (1..=8)."
            ],
            "type": "u16"
          },
          {
            "name": "statKeyB",
            "docs": [
              "Optional second stat key, combined via `op`."
            ],
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "op",
            "docs": [
              "Required iff stat_key_b is present (Line markets)."
            ],
            "type": {
              "option": {
                "defined": {
                  "name": "statOp"
                }
              }
            }
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "marketKind"
              }
            }
          },
          {
            "name": "comparison",
            "type": {
              "defined": {
                "name": "comparison"
              }
            }
          },
          {
            "name": "threshold",
            "docs": [
              "i32 to allow negative margins (oracle predicate range)."
            ],
            "type": "i32"
          },
          {
            "name": "kickoffTs",
            "docs": [
              "Fixture kickoff (unix seconds). Staking closes here."
            ],
            "type": "i64"
          },
          {
            "name": "voidAfterTs",
            "docs": [
              "kickoff_ts + VOID_TIMELOCK_SECS; permissionless void allowed after."
            ],
            "type": "i64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "betStatus"
              }
            }
          },
          {
            "name": "pending",
            "type": {
              "option": {
                "defined": {
                  "name": "pendingSettlement"
                }
              }
            }
          },
          {
            "name": "result",
            "docs": [
              "Final outcome, set at finalize: true = Over wins."
            ],
            "type": {
              "option": "bool"
            }
          },
          {
            "name": "overTotal",
            "type": "u64"
          },
          {
            "name": "underTotal",
            "type": "u64"
          },
          {
            "name": "usdcMint",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "poolBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "betStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "settlementPending"
          },
          {
            "name": "settled"
          },
          {
            "name": "voided"
          }
        ]
      }
    },
    {
      "name": "betVoided",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bet",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "claimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bet",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "comparison",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "greater"
          },
          {
            "name": "less"
          }
        ]
      }
    },
    {
      "name": "createBetArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "fixtureId",
            "type": "u64"
          },
          {
            "name": "statKeyA",
            "type": "u16"
          },
          {
            "name": "statKeyB",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "op",
            "type": {
              "option": {
                "defined": {
                  "name": "statOp"
                }
              }
            }
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "marketKind"
              }
            }
          },
          {
            "name": "comparison",
            "type": {
              "defined": {
                "name": "comparison"
              }
            }
          },
          {
            "name": "threshold",
            "type": "i32"
          },
          {
            "name": "kickoffTs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "marketKind",
      "docs": [
        "Market shape. Line = single predicate over one or two combined stats",
        "(totals, team totals, winner via Subtract > 0, margins). BothScore = GG:",
        "both stats must individually be > 0 (two oracle validations, ANDed)."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "line"
          },
          {
            "name": "bothScore"
          }
        ]
      }
    },
    {
      "name": "pendingSettlement",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "result",
            "docs": [
              "Proposed outcome: true = Over (predicate true), false = Under."
            ],
            "type": "bool"
          },
          {
            "name": "proofTs",
            "docs": [
              "TxLINE event timestamp the proof was anchored at. A challenge must",
              "present a strictly greater proof_ts (latest proof wins)."
            ],
            "type": "i64"
          },
          {
            "name": "challengeDeadlineTs",
            "docs": [
              "When the pending result may be finalized."
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "proofNode",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "hash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "isRightSibling",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "proposeSettlementArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "ts",
            "docs": [
              "Timestamp (ms) used by the oracle to locate the interval root."
            ],
            "type": "i64"
          },
          {
            "name": "fixtureSummary",
            "type": {
              "defined": {
                "name": "scoresBatchSummary"
              }
            }
          },
          {
            "name": "fixtureProof",
            "type": {
              "vec": {
                "defined": {
                  "name": "proofNode"
                }
              }
            }
          },
          {
            "name": "mainTreeProof",
            "type": {
              "vec": {
                "defined": {
                  "name": "proofNode"
                }
              }
            }
          },
          {
            "name": "statA",
            "type": {
              "defined": {
                "name": "statTerm"
              }
            }
          },
          {
            "name": "statB",
            "type": {
              "option": {
                "defined": {
                  "name": "statTerm"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "scoreStat",
      "docs": [
        "The on-chain representation of a single, provable key-value statistic.",
        "This is the leaf of the inner-most Merkle tree."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "key",
            "type": "u32"
          },
          {
            "name": "value",
            "type": "i32"
          },
          {
            "name": "period",
            "type": "i32"
          }
        ]
      }
    },
    {
      "name": "scoresBatchSummary",
      "docs": [
        "The summary for a single fixture's scores events within a 5-minute batch.",
        "This contains the root of the sub-tree of all events for that fixture."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "fixtureId",
            "type": "i64"
          },
          {
            "name": "updateStats",
            "type": {
              "defined": {
                "name": "scoresUpdateStats"
              }
            }
          },
          {
            "name": "eventsSubTreeRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "scoresUpdateStats",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "updateCount",
            "type": "i32"
          },
          {
            "name": "minTimestamp",
            "type": "i64"
          },
          {
            "name": "maxTimestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "settlementFinalized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bet",
            "type": "pubkey"
          },
          {
            "name": "result",
            "type": "bool"
          },
          {
            "name": "voided",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "settlementProposed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bet",
            "type": "pubkey"
          },
          {
            "name": "proposer",
            "type": "pubkey"
          },
          {
            "name": "result",
            "type": "bool"
          },
          {
            "name": "proofTs",
            "type": "i64"
          },
          {
            "name": "challengeDeadlineTs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "side",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "over"
          },
          {
            "name": "under"
          }
        ]
      }
    },
    {
      "name": "statOp",
      "docs": [
        "How two stats combine before the comparison (mirrors the oracle's",
        "BinaryExpression). Add → totals; Subtract → margins/winner markets."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "add"
          },
          {
            "name": "subtract"
          }
        ]
      }
    },
    {
      "name": "statTerm",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "statToProve",
            "type": {
              "defined": {
                "name": "scoreStat"
              }
            }
          },
          {
            "name": "eventStatRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "statProof",
            "type": {
              "vec": {
                "defined": {
                  "name": "proofNode"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "userPosition",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bet",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "side"
              }
            }
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "claimed",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
