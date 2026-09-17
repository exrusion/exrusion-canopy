export const registryEvents = [{
  type: "event",
  name: "PadOpened",
  inputs: [
    { indexed: true, name: "parentToken", type: "address" },
    { indexed: true, name: "owner", type: "address" },
    { indexed: true, name: "configVersion", type: "uint64" },
    { indexed: false, name: "depth", type: "uint8" },
    { indexed: false, name: "ponsRoot", type: "bool" }
  ]
}, {
  type: "event",
  name: "PadStatusChanged",
  inputs: [
    { indexed: true, name: "parentToken", type: "address" },
    { indexed: false, name: "active", type: "bool" }
  ]
}] as const;

export const factoryEvents = [{
  type: "event",
  name: "ChildLaunched",
  inputs: [
    { indexed: true, name: "parentToken", type: "address" },
    { indexed: true, name: "childToken", type: "address" },
    { indexed: true, name: "market", type: "address" },
    { indexed: false, name: "creator", type: "address" },
    { indexed: false, name: "supply", type: "uint256" },
    { indexed: false, name: "initialQuoteSeed", type: "uint256" },
    { indexed: false, name: "configVersion", type: "uint64" },
    { indexed: false, name: "metadataUri", type: "string" }
  ]
}] as const;

export const feeEvents = [{
  type: "event",
  name: "FeeRouted",
  inputs: [
    { indexed: true, name: "childToken", type: "address" },
    { indexed: true, name: "feeToken", type: "address" },
    { indexed: false, name: "amount", type: "uint256" },
    { indexed: false, name: "creatorAmount", type: "uint256" },
    { indexed: false, name: "parentHolderAmount", type: "uint256" },
    { indexed: false, name: "ancestorAmount", type: "uint256" },
    { indexed: false, name: "burnAmount", type: "uint256" },
    { indexed: false, name: "liquidityAmount", type: "uint256" },
    { indexed: false, name: "padOwnerAmount", type: "uint256" },
    { indexed: false, name: "protocolAmount", type: "uint256" }
  ]
}] as const;

export const rewardEvents = [{
  type: "event",
  name: "EpochPublished",
  inputs: [
    { indexed: true, name: "epochId", type: "uint256" },
    { indexed: true, name: "beneficiaryToken", type: "address" },
    { indexed: true, name: "rewardToken", type: "address" },
    { indexed: false, name: "merkleRoot", type: "bytes32" },
    { indexed: false, name: "totalReward", type: "uint256" },
    { indexed: false, name: "snapshotBlock", type: "uint256" },
    { indexed: false, name: "holderCount", type: "uint256" },
    { indexed: false, name: "allocationHash", type: "bytes32" }
  ]
}] as const;

export const marketEvents = [{
  type: "event",
  name: "Buy",
  inputs: [
    { indexed: true, name: "buyer", type: "address" },
    { indexed: true, name: "recipient", type: "address" },
    { indexed: false, name: "quoteIn", type: "uint256" },
    { indexed: false, name: "tokensOut", type: "uint256" },
    { indexed: false, name: "fee", type: "uint256" }
  ]
}, {
  type: "event",
  name: "Sell",
  inputs: [
    { indexed: true, name: "seller", type: "address" },
    { indexed: true, name: "recipient", type: "address" },
    { indexed: false, name: "tokensIn", type: "uint256" },
    { indexed: false, name: "quoteOut", type: "uint256" },
    { indexed: false, name: "fee", type: "uint256" }
  ]
}] as const;
