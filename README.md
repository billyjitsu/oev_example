# API3 - OEV SEARCHER BOT

This repo takes you though setting up and executing a price feed searcher bot on the OEV Network allowing you to update a price feed on the ETH Sepolia test network. 

You will need ETH on both ETH Sepolia and the OEV Network for full functionality.

Only a small amount of ETH is needed for bids and transactions costs on the OEV Network. 

You can bridge from ETH Sepolia to the [OEV Network here](https://oev-network-sepolia-testnet-bridge.eu-north-2.gateway.fm/login):

The bridge page also has an `Add to Metamask` option to easily add the chain to your wallet.

Once the bridging is complete, you can check your wallet to verify that you have some ETH on the OEV network.

Getting Started:

Update .env file with your personal details:
```
SEPOLIA_RPC_URL=https://rpc.ankr.com/eth_sepolia
PRIVATE_KEY=
ETHERSCAN_API_KEY=
```

You will need to deploy the `OevSearcherMulticallV1` on `ETH Sepolia` in order for your wallet to be able to update the price feeds on ETH Sepolia. This smart contract will allow you to bulk multiple transactions in a single call, such as Updating the Price Feed, liquididating a position and then doing something with this value gained. (There is no need to modify this smart contract).  If you would like to learn more about mulitCall, read here.

To deploy the OevSearcherMulticallV1 smart contract using the deploy script.
```
npx hardhat run scripts/deploy.js
```

In order to make a bid in the OEV Auction house.  We must deposit our OEV network ETH into the auction contract.  We call the deposit function on the OEV auction house contract.
```
npx hardhat run scripts/deposit.js
```
You will see a console log of the transaction hash and a notice that the deposit has succeeded.

Once this is completed, we are now ready to request to make a bid in the auctions.

There are two ways to make the bid.  A bid without an expiration time and one with an expiration time (done this this example).

In the AuctionHouse Contract it takes in as set of parameters
```
        bytes32 bidTopic,
        uint256 chainId,
        uint256 bidAmount,
        bytes calldata bidDetails,
        uint256 maxCollateralAmount,
        uint256 maxProtocolFeeAmount,
        uint32 expirationTimestamp
```
- The `bidTopic` contains the details of the chain ID and the proxy contract address of the specific price feed we are looking to update.  In this example, we will be updating the WBTC/USD feed on Sepolia.  It requires it to be in bytes32 format, so we will need to encode it before sending in the transaction.

- The `chainId` specifies the chain we want to update our prices feed on (in this example `11155111` for ETH Sepolia)

- The `bidAmount` is the amount we are willing to bid to win the auction over anybody else that may bid on the same price.

- The `bidDetails` contains the Proxy address of the price feed we want to update, a condition of greater or lower than a specific price, the price we want to update at, which address will be doing the update of the price feed (our deployed multiCall address), and some padding for randomness.  This is required to be in a bytes format, so much be encoded through a function.

- The `maxCollateralAmount` is the collateral you are willing to put up for your bid.  On testnet, this is 0.  Not collateral required.

- The `maxProtocalFeeAmount` is the fee you are willing to pay back to the protocol/dapp.  On testnet, this is 0.  No Fee required.

- The `expirationTimestamp` is how long you are willing to keep this bid.


Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat run scripts/deploy.js
```
