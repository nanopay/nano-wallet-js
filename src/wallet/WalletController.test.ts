'use strict';

import {
	Unit,
	checkHash,
	checkSeed,
	convert,
	deriveSecretKey,
	generateSeed,
} from 'nanocurrency';
import NanoWallet from './WalletController';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import { TunedBigNumber } from '@/utils';
import { resolve } from 'app-root-path';
import { MIN_AMOUNT } from '@/Constants';

const DEFAULT_AMOUNT = process.env.AMOUNT || 0.00001;

const RPC_URL = process.env.RPC_URL
	? process.env.RPC_URL.split(',')
	: ['http://[::1]:7076'];

const WORKER_URL = process.env.WORKER_URL
	? process.env.WORKER_URL.split(',')
	: ['http://[::1]:7076'];

const filePath = resolve('/data/tests/wallet.json');

const importTestSeed = () => {
	const exists = fs.existsSync(filePath);

	if (exists) {
		const fileContent = fs.readFileSync(filePath, 'utf8');
		const data = JSON.parse(fileContent);
		return data.seed;
	}

	return null;
};

const createTestSeed = async () => {
	if (!fs.existsSync(resolve('/data/tests'))) {
		fs.mkdirSync(resolve('/data/tests'), { recursive: true });
	}

	const seed = await generateSeed();
	fs.writeFileSync(filePath, JSON.stringify({ seed }, null, 2));
	return seed;
};

describe('Init Wallet', () => {
	let masterWallet: NanoWallet;
	let ephemeralWallet: NanoWallet;

	it('should init master test wallet', async () => {
		let seed = await importTestSeed();

		if (!seed) {
			console.warn('No Master Wallet detected, creating new...');
			seed = await createTestSeed();
		}

		expect(checkSeed(seed)).toBeTruthy();

		const privateKey = deriveSecretKey(seed, 0);

		masterWallet = new NanoWallet(
			{
				privateKey,
				rpcUrls: RPC_URL,
				workerUrls: WORKER_URL,
				representative:
					'nano_3kc8wwut3u8g1kwa6x4drkzu346bdbyqzsn14tmabrpeobn8igksfqkzajbb',
			},
			null,
		);
	});

	it('should sync master test wallet', async () => {
		expect(await masterWallet.sync()).resolves;
	});

	it('should ensure balance in master test wallet', async () => {
		const minAmount = convert(MIN_AMOUNT.toString(), {
			from: Unit.NANO,
			to: Unit.raw,
		});
		if (TunedBigNumber(masterWallet.balance).isLessThan(minAmount)) {
			const minDepositAmount = TunedBigNumber(minAmount)
				.multipliedBy(10)
				.toString();
			const minDepositAmountInNano = convert(minDepositAmount, {
				from: Unit.raw,
				to: Unit.NANO,
			});
			console.log(
				`Master wallet has no balance, deposit at least ${minDepositAmountInNano} Nano`,
			);
			qrcode.generate(
				`nano:${masterWallet.account}?amount=${minDepositAmount}`,
				{ small: true },
			);
			console.info(`Send 0.0001 to ${masterWallet.account}`);
			for (let count = 1; masterWallet.state.receivable === '0'; count++) {
				process.stdout.write('.'.padEnd(count, '.'));
				await masterWallet.getReceivable();
				await new Promise(res => setTimeout(res, 2000));
			}
			console.log('receivable', masterWallet.state.receivable);
			for (const block of masterWallet.state.receivableBlocks) {
				await masterWallet.receive(block.blockHash);
			}
		}
	}, 60000);

	it('should init ephemeral test wallet', async () => {
		const seed = await generateSeed();

		const privateKey = deriveSecretKey(seed, 0);

		ephemeralWallet = new NanoWallet(
			{
				privateKey,
				rpcUrls: RPC_URL,
				workerUrls: WORKER_URL,
				representative:
					'nano_3kc8wwut3u8g1kwa6x4drkzu346bdbyqzsn14tmabrpeobn8igksfqkzajbb',
			},
			null,
		);
	});

	it('should send amount', async () => {
		const amount = convert(DEFAULT_AMOUNT.toString(), {
			from: Unit.NANO,
			to: Unit.raw,
		});

		const { hash } = await masterWallet.send(ephemeralWallet.account, amount);

		expect(checkHash(hash)).toBeTruthy();
	}, 60000);

	it('should detect receivables', async () => {
		let receivable = '0';
		for (let i = 0; receivable === '0' && i < 10; i++) {
			const response = await ephemeralWallet.getReceivable();
			receivable = response.receivable;
			await new Promise(res => setTimeout(res, 1000));
		}
		expect(ephemeralWallet.state.receivableBlocks.length).toBeGreaterThan(0);
	}, 60000);

	it('should receive', async () => {
		const receivablesCount = ephemeralWallet.state.receivableBlocks.length;
		expect(receivablesCount).toBeGreaterThanOrEqual(1);
		const lastReceivable =
			ephemeralWallet.state.receivableBlocks[receivablesCount - 1];
		await ephemeralWallet.receive(lastReceivable.blockHash);
	}, 60000);

	it('should set representative', async () => {
		const representative = masterWallet.account;
		const { hash } = await ephemeralWallet.setRepresentative(representative);
		expect(checkHash(hash)).toBeTruthy();
		expect(ephemeralWallet.config.representative).toBe(representative);
		expect(ephemeralWallet.state.representative).toBe(representative);
	}, 60000);
});
