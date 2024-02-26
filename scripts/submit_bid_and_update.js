const {
  Wallet,
  Contract,
  JsonRpcProvider,
  keccak256,
  solidityPacked,
  AbiCoder,
  parseEther,
  hexlify,
  randomBytes,
} = require("ethers");
const dotenv = require("dotenv");
dotenv.config();
const OevAuctionHouseAbi = require("./contractABIs/OevAuctionHouseABI.json");

/**
 * Constants
 **/
const OEV_AUCTION_HOUSE_CONTRACT_ADDRESS = "0x34f13A5C0AD750d212267bcBc230c87AEFD35CC5";  // On OEV testnet
const CHAIN_ID = 11155111;                                                                // ETH Sepolia chain ID                    
const WBTC_USD_PROXY_ADDRESS = "0xa8cea58ab9060600e94bb28b2c8510b73171b55c";              // ETH Sepolia WBTC/USD price feed
const API3SERVER_V1_CONTRACT_ADDRESS = "0x709944a48cAf83535e43471680fDA4905FB3920a";      // API3Proxy server that will allow us to update the price feed

// Your unique inputs
const OUR_DEPLOYED_MULTICALL_CONTRACT_ADDRESS = "0xF6f7f3667Cf5A047Bd6aE7dE363642b71D188C37"; //Your smart contract deployed on ETH Sepolia network
const PRICE = parseEther("52605");                                                        // The price point you a bidding lower or higher than
const GREATER_OR_LOWER = "LTE";                                                           // Setting if it will be "less than or equal to" (either "LTE" or "GTE")
const BID_AMOUNT = parseEther("0.01");                                                    // The amount of ETH you are bidding to win this auction and perform the oracle update
const PUBLIC_ADDRESS_OF_THE_BIDDER = "0xe2b8651bF50913057fF47FC4f02A8e12146083B8";        // The wallet address of the signer doing the bid

// Setup our contract object for the auction house on OEV test network
const provider = new JsonRpcProvider("https://oev-network-sepolia-testnet-rpc.eu-north-2.gateway.fm");
const privateKey = process.env.PRIVATE_KEY;
const wallet = new Wallet(privateKey, provider);

const auctionHouse = new Contract(
  OEV_AUCTION_HOUSE_CONTRACT_ADDRESS,   // OevAuctionHouse contract address
  OevAuctionHouseAbi,
  wallet
);


// Function that encodes which chain and which price feed are we trying to update with our bid 
const getBidTopic = (chainId, proxyAddress) => {
  return keccak256(
    solidityPacked(["uint256", "address"], [BigInt(chainId), proxyAddress])
  );
};

// Function to encode the bid details and return to bytes
const getBidDetails = (proxyAddress, condition, conditionValue, updaterAddress) => {
  const abiCoder = new AbiCoder();
  const BID_CONDITIONS = [
    { onchainIndex: 0n, description: "LTE" },
    { onchainIndex: 1n, description: "GTE" },
  ];
  const conditionIndex = BID_CONDITIONS.findIndex((c) => c.description === condition);
  return abiCoder.encode(
    ["address", "uint8", "uint256", "address", "bytes32"],
    [proxyAddress, conditionIndex, conditionValue, updaterAddress, hexlify(randomBytes(32)),]
  );
};

const placeBidWithExpiration = async () => {
  const bidTopic = getBidTopic(
    CHAIN_ID,                                     // Chain ID that the price feed is on                           
    WBTC_USD_PROXY_ADDRESS                        // The Price feed Proxy we want to update. Currently the only updatable price feed on OEV testnet
  );

  const bidDetails = getBidDetails(
    WBTC_USD_PROXY_ADDRESS,                       // Proxy address: Sepolia WBTC/USD price feed - the price feed we want to update
    GREATER_OR_LOWER,                             // The condition you want to update
    PRICE,                                        // The price you want to update
    OUR_DEPLOYED_MULTICALL_CONTRACT_ADDRESS,      // Your deployed MultiCall contract Address
    hexlify(randomBytes(32))                      // Random padding
  );

  // Placing our bid with the auction house on OEV testnet
  const tx = await auctionHouse.placeBidWithExpiration(
    bidTopic,                                     // Details of the chain and price feed we want to update encoded
    CHAIN_ID,                                     // Chain ID
    BID_AMOUNT,                                   // The amount of ETH you are bidding to win this auction and perform the oracle update
    bidDetails,                                   // The details about the bid, proxy address, condition, price, your deployed multicall and random
    parseEther("0"),                              // Collateral Basis Points is 0 on testnet - no need to adjust
    parseEther("0"),                              // Protocol Fee Basis Points is 0 on testnet - no need to adjust
    Math.floor(Date.now() / 1000) + 60 * 60 * 12  // 12 hours from now
  );
  console.log(tx.hash);
  await tx.wait();
  console.log("Bid placed");

  /////// Next Section ////////
  /////// Check Bid Status ////////

  // Encode our bidding details to check on the auctionHouse if our bid is awarded
  const bidId = keccak256(
    solidityPacked(
      ["address", "bytes32", "bytes32"],
      [
        PUBLIC_ADDRESS_OF_THE_BIDDER,             // The wallet address if the signer doing the bid (public of your private key)
        bidTopic,                                 // Details of the chain and price feed we want to update encoded 
        keccak256(bidDetails),                    // The details about the bid, proxy address, condition, price, your deployed multicall and random
      ]
    )
  );

  const bid = await auctionHouse.bids(bidId);
  console.log("Bids: ", bid);
  // check if the bid is awarded
  if (bid[0] === 2n) {
    console.log("Bid is awarded");
  }

  //////// Next Section ////////
  //////// Listen for Awarded Bid ////////

  const awardedTransaction = await new Promise((resolve, reject) => {
    console.log("Waiting for bid to be awarded...");
    auctionHouse.on(
      "AwardedBid",
      (bidder, bidTopic, awardBidId, awardDetails, bidderBalance) => {
        //   console.log(`Event Data:`, { bidder, bidTopic, awardBidId, awardDetails, bidderBalance });
        if (bidId === awardBidId) {
          console.log("Bid awarded");
          auctionHouse.removeAllListeners("AwardedBid");
          resolve(awardDetails); 
        }
      }
    );
  });

  /////// Next Section ////////
  /////// Perform Oracle Update w Multicall ////////

  // Once our bid has been awarded, we want to update the oracle with the info on ETH Sepolia
  const provider = new JsonRpcProvider("https://gateway.tenderly.co/public/sepolia");
  const sepoliaWallet = new Wallet(privateKey, provider);

  const OevSearcherMulticallV1 = new Contract(
    OUR_DEPLOYED_MULTICALL_CONTRACT_ADDRESS,          // Our deployed MultiCall contract Address on ETH Sepolia
    [
      "function externalMulticallWithValue(address[] calldata targets, bytes[] calldata data, uint256[] calldata values) external payable returns (bytes[] memory returndata)",
    ],
    sepoliaWallet
  );

  // Here you can bundle a set of Transactions to be executed in a single call
  // 1. Update the oracle (shown below), 2. Liquidate positions, 3. Do something with the liquidation
  const multiTx = await OevSearcherMulticallV1.externalMulticallWithValue(
    [API3SERVER_V1_CONTRACT_ADDRESS],         // Targets: [Contract Addresses] The contract that can update the price feed
    [awardedTransaction],                     // Data: [encoded functions] The transaction details with signature and data that allows us to update the price feed
    [BID_AMOUNT],                             // Value: [Value sent] The matching bid amount that you bid on the OEV network (must match or update will fail)   
    {
      value: BID_AMOUNT,                      // Passing the value on the transaction
    }
  );
  await multiTx.wait();
  console.log("Oracle update performed");
};


placeBidWithExpiration();


