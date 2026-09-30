// Generated from contracts/out. Only the parts the keeper and app use.
export const factoryAbi = [
 {
  "type": "function",
  "name": "keeper",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "liveCap",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "minTrade",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "open",
  "inputs": [
   {
    "name": "stockId",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "promiseBps",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "amount",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "vault",
    "type": "address",
    "internalType": "address"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "stock",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "tuple",
    "internalType": "struct StockConfig",
    "components": [
     {
      "name": "token",
      "type": "address",
      "internalType": "address"
     },
     {
      "name": "pool",
      "type": "address",
      "internalType": "address"
     },
     {
      "name": "router",
      "type": "address",
      "internalType": "address"
     },
     {
      "name": "fee",
      "type": "uint24",
      "internalType": "uint24"
     },
     {
      "name": "pancake",
      "type": "bool",
      "internalType": "bool"
     },
     {
      "name": "venusPriced",
      "type": "bool",
      "internalType": "bool"
     },
     {
      "name": "twapWindow",
      "type": "uint32",
      "internalType": "uint32"
     },
     {
      "name": "cap",
      "type": "uint64",
      "internalType": "uint64"
     },
     {
      "name": "band",
      "type": "uint64",
      "internalType": "uint64"
     },
     {
      "name": "maxSlippage",
      "type": "uint64",
      "internalType": "uint64"
     }
    ]
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "stockCount",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "vaultCount",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "vaults",
  "inputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "vaultsOf",
  "inputs": [
   {
    "name": "saver",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "address[]",
    "internalType": "address[]"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "event",
  "name": "VaultOpened",
  "inputs": [
   {
    "name": "saver",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "vault",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "stockId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "amount",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   },
   {
    "name": "promiseBps",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   }
  ],
  "anonymous": false
 }
] as const;

export const vaultAbi = [
 {
  "type": "function",
  "name": "cap",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "deposit",
  "inputs": [
   {
    "name": "amount",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "multiplier",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "pullOutIfUnhealthy",
  "inputs": [],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "rebalance",
  "inputs": [],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "saver",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "setMultiplier",
  "inputs": [
   {
    "name": "m",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "status",
  "inputs": [],
  "outputs": [
   {
    "name": "s",
    "type": "tuple",
    "internalType": "struct PlinthVault.Status",
    "components": [
     {
      "name": "total",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "stockUsd",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "safeUsd",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "price",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "floor",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "target",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "breakDistance",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "floorRate",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "multiplier",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "cap",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "promised",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "deposited",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "maturity",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "marketIndex",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "gateCode",
      "type": "uint8",
      "internalType": "uint8"
     }
    ]
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "stock",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "tuple",
    "internalType": "struct StockConfig",
    "components": [
     {
      "name": "token",
      "type": "address",
      "internalType": "address"
     },
     {
      "name": "pool",
      "type": "address",
      "internalType": "address"
     },
     {
      "name": "router",
      "type": "address",
      "internalType": "address"
     },
     {
      "name": "fee",
      "type": "uint24",
      "internalType": "uint24"
     },
     {
      "name": "pancake",
      "type": "bool",
      "internalType": "bool"
     },
     {
      "name": "venusPriced",
      "type": "bool",
      "internalType": "bool"
     },
     {
      "name": "twapWindow",
      "type": "uint32",
      "internalType": "uint32"
     },
     {
      "name": "cap",
      "type": "uint64",
      "internalType": "uint64"
     },
     {
      "name": "band",
      "type": "uint64",
      "internalType": "uint64"
     },
     {
      "name": "maxSlippage",
      "type": "uint64",
      "internalType": "uint64"
     }
    ]
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "stockId",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "withdraw",
  "inputs": [
   {
    "name": "share",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "withdrawInKind",
  "inputs": [
   {
    "name": "share",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "includeStock",
    "type": "bool",
    "internalType": "bool"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "event",
  "name": "Deposited",
  "inputs": [
   {
    "name": "from",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "amount",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   },
   {
    "name": "promised",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "MovedSafeLeg",
  "inputs": [
   {
    "name": "from",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "to",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "amount",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "MultiplierSet",
  "inputs": [
   {
    "name": "by",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "multiplier",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "PulledOut",
  "inputs": [
   {
    "name": "marketIndex",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "gateCode",
    "type": "uint8",
    "indexed": false,
    "internalType": "uint8"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "Rebalanced",
  "inputs": [
   {
    "name": "reason",
    "type": "uint8",
    "indexed": false,
    "internalType": "enum FloorMath.Reason"
   },
   {
    "name": "deltaUsd",
    "type": "int256",
    "indexed": false,
    "internalType": "int256"
   },
   {
    "name": "price",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   },
   {
    "name": "total",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   },
   {
    "name": "floor",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   },
   {
    "name": "target",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   },
   {
    "name": "multiplier",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "Withdrawn",
  "inputs": [
   {
    "name": "share",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   },
   {
    "name": "usdtOut",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   },
   {
    "name": "promisedLeft",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "WithdrawnInKind",
  "inputs": [
   {
    "name": "share",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   },
   {
    "name": "stockOut",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   },
   {
    "name": "receiptOut",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   },
   {
    "name": "usdtOut",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   }
  ],
  "anonymous": false
 }
] as const;
