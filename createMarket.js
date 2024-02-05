const bs58 = require('bs58');
const {
    MarketV2,
    Token,
    DEVNET_PROGRAM_ID,
    MAINNET_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    MARKET_STATE_LAYOUT_V2,
    LOOKUP_TABLE_CACHE,
    TxVersion,
    buildSimpleTransaction,
} = require('@raydium-io/raydium-sdk');
const {
    clusterApiUrl,
    Keypair,
    Connection,
    PublicKey,
    VersionedTransaction,
    LAMPORTS_PER_SOL
} = require('@solana/web3.js');
const {
    getMint,
} = require("@solana/spl-token");

require("dotenv").config();

const PROGRAMIDS = DEVNET_PROGRAM_ID;
const DEVNET_MODE = process.env.DEVNET_MODE === "true";
const makeTxVersion = TxVersion.V0; // LEGACY
const addLookupTableInfo = DEVNET_MODE ? undefined : LOOKUP_TABLE_CACHE;
const endpoint = clusterApiUrl('devnet');
const connection = new Connection(endpoint, 'confirmed');

const payer = Keypair.fromSecretKey(bs58.decode(process.env.PAYER_SECRET_KEY));
console.log("Payer:", payer.publicKey.toBase58());

const sendAndConfirmTransactions = async (connection, payer, transactions) => {
    for (const tx of transactions) {
        let signature;
        if (tx instanceof VersionedTransaction) {
            tx.sign([payer]);
            signature = await connection.sendTransaction(tx);
        }
        else
            signature = await connection.sendTransaction(tx, [payer]);
        await connection.confirmTransaction({ signature });
    }
};

const createOpenBookMarket = async (mintAddress, minOrderSize, tickSize) => {
    console.log("Creating OpenBook market...", mintAddress);

    const mint = new PublicKey(mintAddress);
    const mintInfo = await getMint(connection, mint);
    console.log("=========== mintinfo: ", mintInfo);

    const baseToken = new Token(TOKEN_PROGRAM_ID, mintAddress, mintInfo.decimals);
    const quoteToken = new Token(TOKEN_PROGRAM_ID, "So11111111111111111111111111111111111111112", 9, "WSOL", "WSOL");
    
    const { innerTransactions, address } = await MarketV2.makeCreateMarketInstructionSimple({
        connection,
        wallet: payer.publicKey,
        baseInfo: baseToken,
        quoteInfo: quoteToken,
        lotSize: minOrderSize, // default 1
        tickSize: tickSize, // default 0.01
        dexProgramId: PROGRAMIDS.OPENBOOK_MARKET,
        makeTxVersion,
    });

    const transactions = await buildSimpleTransaction({
        connection,
        makeTxVersion,
        payer: payer.publicKey,
        innerTransactions,
        addLookupTableInfo,
    });

    await sendAndConfirmTransactions(connection, payer, transactions);
    console.log("Market ID:", address.marketId.toBase58());
};

const createPool = async (mintAddress, tokenAmount, solAmount) => {
    console.log("Creating pool...", mintAddress, tokenAmount, solAmount);

    // const airdropSignature = await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
    // await connection.confirmTransaction({ signature: airdropSignature, ...(await connection.getLatestBlockhash()) });

    const mint = new PublicKey(mintAddress);
    const mintInfo = await getMint(connection, mint);
    const baseToken = new Token(TOKEN_PROGRAM_ID, mintAddress, mintInfo.decimals);
    const quoteToken = new Token(TOKEN_PROGRAM_ID, "So11111111111111111111111111111111111111112", 9, "WSOL", "WSOL");

    const accounts = await Market.findAccountsByMints(connection, baseToken.mint, quoteToken.mint, PROGRAMIDS.OPENBOOK_MARKET);
    if (accounts.length === 0) {
        console.log("Not found OpenBook market!");
        return;
    }
    const marketId = accounts[0].publicKey;

    console.log("== MARKET_ID : ", marketId)

    const startTime = Math.floor(Date.now() / 1000);
    const baseAmount = xWeiAmount(tokenAmount, mintInfo.decimals);
    const quoteAmount = xWeiAmount(solAmount, 9);
    const walletTokenAccounts = await getWalletTokenAccount(connection, payer.publicKey);

    const { innerTransactions, address } = await Liquidity.makeCreatePoolV4InstructionV2Simple({
        connection,
        programId: PROGRAMIDS.AmmV4,
        marketInfo: {
            marketId: marketId,
            programId: PROGRAMIDS.OPENBOOK_MARKET,
        },
        baseMintInfo: baseToken,
        quoteMintInfo: quoteToken,
        baseAmount: baseAmount,
        quoteAmount: quoteAmount,
        startTime: new BN(startTime),
        ownerInfo: {
            feePayer: payer.publicKey,
            wallet: payer.publicKey,
            tokenAccounts: walletTokenAccounts,
            useSOLBalance: true,
        },
        associatedOnly: false,
        checkCreateATAOwner: true,
        makeTxVersion: makeTxVersion,
        feeDestinationId: DEVNET_MODE ? new PublicKey("3XMrhbv989VxAMi3DErLV9eJht1pHppW5LbKxe9fkEFR") : new PublicKey("7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5"), // only mainnet use this
    });

    console.log("========================1")
    const transactions = await buildSimpleTransaction({
        connection: connection,
        makeTxVersion: makeTxVersion,
        payer: payer.publicKey,
        innerTransactions: innerTransactions,
        addLookupTableInfo: addLookupTableInfo,
    });
    console.log("========================2")
    await sendAndConfirmTransactions(connection, payer, transactions);
    console.log("AMM ID:", address.ammId.toBase58());
};

createOpenBookMarket("3HDRCpc5PdwrrJXNeamM9JTSEQTrCFPW6FULXj6muraK", 1, 0.000001);
