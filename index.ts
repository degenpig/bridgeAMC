import admin from "firebase-admin";
import credentials from "./credentials.json";
const db = admin.initializeApp({ credential: admin.credential.cert(credentials as any) }).firestore();

import { providers, Wallet, Contract, BigNumber, utils } from "ethers";
import axios from "axios";

import TokenAbi from "./abis/Token.json";
import BridgeAssist from "./abis/BridgeAssist.json";
import walletPrivateKey from "./secret"; // 0xddF8CDa9d8A425b5a8FFb64BfC79857bA9b57083 wallet privateKey
const address_BAB = "0xd78875585b3A35DF8615534C56F7FecC99bA1FDC";
const address_BAE = "0x1376DA259ac84754a725CE0E9A6589a3302ed6B5";
const address_TKNB = "0xcF0Bea8B08fd28E339EFF49F717A828f79F7F5eC";
const address_TKNE = "0x29239242A83479a4074Cb1c9e2A3e6705A4A4455";

const providerB = new providers.JsonRpcProvider("https://bsc-dataseed.binance.org/"); // for reading contracts
const providerE = new providers.InfuraProvider(1, {
  projectId: "e85d7cd42e474f1781f8429e3686e672",
  projectSecret: "a0e14ae418b04ad09671a5afe9430e1c",
}); // for reading contracts
const signerB = new Wallet(walletPrivateKey, providerB);
const signerE = new Wallet(walletPrivateKey, providerE);
const BAB = new Contract(address_BAB, BridgeAssist.abi, providerB);
const BAE = new Contract(address_BAE, BridgeAssist.abi, providerE);
const TKNB = new Contract(address_TKNB, TokenAbi.abi, providerB);
const TKNE = new Contract(address_TKNE, TokenAbi.abi, providerE);
// queues and buffer lifetime
const TIME_QUEUE = 300000;
const TIME_PARAMS = 30000;
const TIME_PRICE = 30000;

import bunyan from "bunyan";
import { LoggingBunyan } from "@google-cloud/logging-bunyan";
// import { Fetcher, Token } from "@uniswap/sdk";
const loggingBunyan = new LoggingBunyan();
const logger = bunyan.createLogger({ name: "my-service", streams: [loggingBunyan.stream("debug")] });

// Info Buffers
type DirectionType = "BE" | "EB";
type ChangeableParams = { CTF: number; FTM: number; PSD: boolean };
type ProbitDataType = { last: string; low: string; high: string; change: string; base_volume: string; quote_volume: string; market_id: string; time: string };
type PricesBuffer = { date: number; prices: { TEP: number; TBP: number } };
type CostBuffer = { date: number; cost: BigNumber };
let paramsBuffer = { date: 0, params: { CTF: 200, FTM: 200, PSD: false } as ChangeableParams };
let costBuffers = { BE: { date: 0, cost: BigNumber.from(0) }, EB: { date: 0, cost: BigNumber.from(0) } } as { [key in DirectionType]: CostBuffer };
let pricesBuffer = { date: 0, prices: { TEP: 0, TBP: 0 } } as PricesBuffer;

function removeTrailingZeros(str: string): string {
  if (str === "0") return str;
  if (str.slice(-1) === "0") return removeTrailingZeros(str.substr(0, str.length - 1));
  if (str.slice(-1) === ".") return str.substr(0, str.length - 1);
  return str;
}
function BNToNumstr(bn: BigNumber | string, dec = 18, prec = 18): string {
  const str = bn.toString();
  if (str === "0") return str;
  if (isNaN(Number(str))) return "NaN";
  if (str.length <= dec) return removeTrailingZeros(("0." + "000000000000000000".substr(0, dec - str.length) + str).substr(0, dec - str.length + prec + 2));
  else return removeTrailingZeros([(str.substr(0, str.length - dec), str.slice(-dec))].join(".").substr(0, str.length - dec + prec + 1));
}

async function loadChangeableParams() {
  if (Date.now() - paramsBuffer.date < TIME_PARAMS) return paramsBuffer.params;
  try {
    const params = (await db.collection("config").doc("changeables").get()).data() as ChangeableParams | undefined;
    if (!params) throw new Error("Could not get config from firestore");
    paramsBuffer = { date: Date.now(), params };
    return params;
  } catch (error) {
    throw new Error(`Could not load params: ${error.reason || error.message}`);
  }
}
async function writeQueue(direction: DirectionType, address: string) {
  try {
    await db.collection(`queue${direction}`).doc(address).create({ date: Date.now() });
  } catch (error) {
    throw new Error(`Could not write to queue: ${error.reason || error.message}`);
  }
}
async function clearQueue(direction: DirectionType, address: string) {
  try {
    await db.collection(`queue${direction}`).doc(address).delete();
  } catch (error) {
    throw new Error(`Could not clear queue: ${error.reason || error.message}`);
  }
}
async function assertQueue(direction: DirectionType, address: string) {
  let entry: any;
  try {
    entry = (await db.collection(`queue${direction}`).doc(address).get()).data();
  } catch (error) {
    throw new Error(`Could not check request queue: ${error.reason || error.message}`);
  }
  if (entry) {
    if (Date.now() - entry.date < TIME_QUEUE) throw new Error(`Request done recently: timeout is 5min`);
    else await db.collection(`queue${direction}`).doc(address).delete(); // if it was left undeleted since last time
  }
}

async function getPrices() {
  if (Date.now() - pricesBuffer.date < TIME_PRICE) return pricesBuffer.prices;
  try {
    const [{ data }] = await Promise.all([
      axios.get(`https://api.probit.com/api/exchange/v1/ticker?market_ids=TOZ-ETH,BNB-USDT,ETH-USDT`),
    ]);
    const res = data as { data: [ProbitDataType, ProbitDataType, ProbitDataType] };
    if (!res.data?.length) throw new Error("No such pairs");
    const TEP = Number(res.data[0].last);
    const BU = Number(res.data[1].last);
    const EU = Number(res.data[2].last);
    const TBP = TEP / (BU / EU);
    const prices = { TEP, TBP };
    pricesBuffer = { date: Date.now(), prices };
    return prices;
  } catch (error) {
    throw new Error(`Could not get prices: ${error.message}`);
  }
}
// Calculate Cost
function _calcCost(gas: BigNumber, gasPrice: BigNumber, tknPrice: number) {
  return gasPrice
    .mul(gas)
    .mul(1e8)
    .div(Math.trunc(tknPrice * 1e8))
}
function calcCost(BG: BigNumber, BGP: BigNumber, TBP: number, EG: BigNumber, EGP: BigNumber, TEP: number) {
  return _calcCost(BG, BGP, TBP).add(_calcCost(EG, EGP, TEP));
}
// Get ETH Gas Price x1.2
async function _getEGP() {
  const _gp = (await providerE.getGasPrice()).mul(120).div(100);
  if (_gp.lt(40e9)) return BigNumber.from(40e9)
  return _gp
}
// Estimate Cost
async function estimateCost(direction: DirectionType) {
  const _GPs = { BE: [BigNumber.from(26000), BigNumber.from(58000)], EB: [BigNumber.from(72000), BigNumber.from(54000)] }; // [BGas, EGas]
  if (Date.now() - Number(costBuffers[direction].date) < TIME_PRICE) return costBuffers[direction].cost;
  try {
    const [BGP, EGP, { TBP, TEP }] = await Promise.all([providerB.getGasPrice(), _getEGP(), getPrices()]);
    const cost = calcCost(BigNumber.from(_GPs[direction][0]), BGP, TBP, BigNumber.from(_GPs[direction][1]), EGP, TEP);
    costBuffers[direction] = { date: Date.now(), cost };
    return cost;
  } catch (error) {
    throw new Error(`Could not estimate cost: ${error.reason || error.message}`);
  }
}
// Estimate Fees applied
async function estimateFee(direction: DirectionType) {
  try {
    const [cost, params] = await Promise.all([estimateCost(direction), loadChangeableParams()]);
    return cost.mul(params.CTF).div(100);
  } catch (error) {
    throw new Error(`Could not estimate fee: ${error.message}`);
  }
}
// Check safety of following swap attempt
async function assureSafety(direction: DirectionType, address: string) {
  try {
    const _TKN = { BE: TKNB, EB: TKNE }[direction];
    const _address_BA = { BE: address_BAB, EB: address_BAE }[direction];
    const [allowance, balance, fee, params]: [BigNumber, BigNumber, BigNumber, ChangeableParams] = await Promise.all([
      _TKN.allowance(address, _address_BA),
      _TKN.balanceOf(address),
      estimateFee(direction),
      loadChangeableParams(),
    ]);
    const min = fee.mul(params.FTM).div(100);
    logger.debug(`assureSafety(): [direction]:${direction}|[address]:${address}|[allowance]:${allowance}|[balance]:${balance}|[fee]:${fee}`);
    if (allowance.lt(min)) throw new Error(`Amount is too low. Should be not less than ${BNToNumstr(min, 18, 2)} `);
    if (allowance.gt(balance)) throw new Error(`Actual balance (${balance}) is lower than allowance (${allowance})`);
    return { allowance, fee };
  } catch (error) {
    throw new Error(`Assertion failure: ${error.reason || error.message}`);
  }
}
// Process requests
async function _collect(direction: DirectionType, address: string, amount: BigNumber) {
  const _signer = { BE: signerB, EB: signerE }[direction];
  const _BA = { BE: BAB, EB: BAE }[direction];
  let tx: providers.TransactionResponse;
  let receipt: providers.TransactionReceipt;
  let err: Error;
  try {
    const ptx = await _BA.populateTransaction.collect(address, amount);
    if (direction === "EB") ptx.gasPrice = await _getEGP();
    logger.debug(`_collect(${direction[0]}|${address}) send...`);
    tx = await _signer.sendTransaction(ptx);
  } catch (error) {
    err = new Error(`[reason]:${error.reason}`);
    logger.warn(`_collect(${direction[0]}|${address}) (ptx_send)  failure... Info: [${err.message}|==|${error.message}]`);
    return { err, tx: undefined, receipt: undefined };
  }
  try {
    logger.debug(`_collect(${direction[0]}|${address}) ${[tx.nonce, tx.hash]} wait...`);
    receipt = await tx.wait();
    logger.debug(`_collect(${direction[0]}|${address}) ${receipt.transactionHash}|GAS ${receipt.gasUsed}/${tx.gasLimit}|GP ${BNToNumstr(tx.gasPrice, 9, 3)}`);
    return { err: undefined, tx, receipt };
  } catch (error) {
    err = new Error(`[reason]:${error.reason}|[tx]:${[tx.nonce, tx.hash]}`);
    logger.warn(`_collect(${direction[0]}|${address}) (tx_wait)  failure... Info: [${err.message}|==|${error.message}]`);
    return { err, tx, receipt: undefined };
  }
}
function _wait(ms = 5000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function _dispense(
  direction: DirectionType,
  address: string,
  amount: BigNumber,
  retriesLeft = 2
): Promise<
  | { err: Error; tx: undefined; receipt: undefined }
  | { err: Error; tx: providers.TransactionResponse; receipt: undefined }
  | { err: undefined; tx: providers.TransactionResponse; receipt: providers.TransactionReceipt }
> {
  const _signer = { BE: signerE, EB: signerB }[direction];
  const _BA = { BE: BAE, EB: BAB }[direction];
  let err: Error;
  let tx: providers.TransactionResponse;
  let receipt: providers.TransactionReceipt;
  try {
    const ptx = await _BA.populateTransaction.dispense(address, amount);
    if (direction === "BE") ptx.gasPrice = await _getEGP();
    logger.debug(`_dispense(${direction[1]}|${address}) ${ptx.nonce} send...`);
    tx = await _signer.sendTransaction(ptx);
  } catch (error) {
    err = new Error(`[reason]:${error.reason}`);
    logger.warn(`_dispense(${direction[1]}|${address}) (ptx_send) failure... Retries left: ${retriesLeft} | Info: [${err.message}|==|${error.message}]`);
    if (retriesLeft) {
      await _wait();
      return await _dispense(direction, address, amount, retriesLeft - 1);
    } else return { err, tx: undefined, receipt: undefined };
  }
  try {
    logger.debug(`_dispense(${direction[1]}|${address}) ${[tx.nonce, tx.hash]} wait...`);
    receipt = await tx.wait();
    logger.debug(`_dispense(${direction[1]}|${address}) ${receipt.transactionHash}|GAS ${receipt.gasUsed}/${tx.gasLimit}|GP ${BNToNumstr(tx.gasPrice, 9, 3)}`);
    return { err: undefined, tx, receipt };
  } catch (error) {
    err = new Error(`[reason]:${error.reason}|[tx]:${[tx.nonce, tx.hash]}`);
    logger.warn(`_dispense(${direction[1]}|${address}) (tx_wait) failure... Retries left: ${retriesLeft} | Info: [${err.message}|==|${error.message}]`);
    return { err, tx, receipt: undefined };
  }
}
async function processRequest(direction: DirectionType, address: string) {
  let err: Error;
  let txHashCollect: string;
  let txHashDispense: string;
  let sas: { allowance: BigNumber; fee: BigNumber };
  try {
    await writeQueue(direction, address);
    sas = await assureSafety(direction, address);
    const resC = await _collect(direction, address, sas.allowance);
    if (resC.err) throw new Error(`Could not collect: ${resC.err.message}`);
    txHashCollect = resC.receipt.transactionHash as string;
  } catch (error) {
    err = new Error(`Could not process request: ${error.message}`);
    return { err, txHashCollect: undefined, txHashDispense: undefined };
  }
  try {
    const resD = await _dispense(direction, address, sas.allowance.sub(sas.fee));
    if (resD.err) throw new Error(`Could not dispense: ${resD.err.message}`);
    txHashDispense = resD.receipt.transactionHash as string;
    try {
      await clearQueue(direction, address);
    } catch (error) {
      logger.warn(`clearQueue() failure... Error: ${error.message}`);
    }
    return { err: undefined, txHashCollect, txHashDispense };
  } catch (error) {
    err = new Error(`Could not process request: ${error.message}`);
    return { err, txHashCollect, txHashDispense: undefined };
  }
}

const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors());
app.get("/process", async (req: any, res: any) => {
  const direction = typeof req.query.direction === "string" ? (req.query.direction.toUpperCase() as DirectionType) : undefined;
  const address = typeof req.query.address === "string" ? req.query.address.toLowerCase() : undefined;
  let dispenseFailure: false | string = false;
  try {
    if (!direction || !["BE", "EB"].includes(direction)) throw new Error("Invalid query: 'direction' must be 'BE' or 'EB'");
    if (!address || !utils.isAddress(address) || address === "0x0000000000000000000000000000000000000000") throw new Error("Invalid query: 'address'");
    await assertQueue(direction, address);
  } catch (error) {
    res.status(400).send(error.message);
    return;
  }
  const _prefix = `[${direction}][${address}]`;
  try {
    logger.info(`${_prefix}: Incoming request`);
    const result = await processRequest(direction, address);
    if (result.err) {
      // if asset was collected but not dispensed
      if (result.txHashCollect && !result.txHashDispense) dispenseFailure = result.txHashCollect;
      throw result.err;
    }
    logger.info(`${_prefix}: Success. Collect: ${result.txHashCollect}, Dispense: ${result.txHashDispense}`);
    res.status(200).send({ txHashCollect: result.txHashCollect, txHashDispense: result.txHashDispense });
  } catch (error) {
    logger.error(`${_prefix}: Failed. Error: ${error.message}`);
    if (dispenseFailure) {
      // if asset was collected but not dispensed
      logger.fatal(`!!DISPENSE FAILED AFTER SUCCESSFUL COLLECT. TX HASH: [${dispenseFailure}]`);
      // only in that case response status is 500
      res
        .status(500)
        .send(
          "WARNING! Asset was collected but due to internal server error it wasn't dispensed to you on another blockchain. " +
            "Administrator shall soon receive automatic message and dispense manually. Or you can contact the support right now. | " +
            `collect() transaction hash: [${dispenseFailure}] | ` +
            `Error returned: ${error.reason || error.message}`
        );
    } else {
      res.status(400).send(error.reason || error.message);
    }
  }
});
app.get("/info", async (req: any, res: any) => {
  try {
    const [BE, EB, { FTM, PSD }] = await Promise.all([estimateFee("BE"), estimateFee("EB"), loadChangeableParams()]);
    res.status(200).send({ BE: BE.toString(), EB: EB.toString(), MIN_BE: BE.mul(FTM).div(100).toString(), MIN_EB: EB.mul(FTM).div(100).toString(), PSD });
  } catch (error) {
    res.status(400).send(error.reason || error.message);
  }
});
const port = process.env.PORT || 3001;
app.listen(port, () => {
  logger.info(`Express app listening at port ${port}`);
});
