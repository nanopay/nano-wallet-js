import {
	Unit,
	convert,
	createBlock,
	deriveAddress,
	derivePublicKey,
	validateWork,
} from 'nanocurrency';
import NanoRPC, { NanoRpcConfig } from '../rpc/RpcController';
import {
	DEFAULT_TIMEOUT,
	MIN_AMOUNT,
	RECEIVE_DIFFICULTY,
	SEND_DIFFICULTY,
} from '@/Constants';
import BaseController from '@/BaseController';
import { TunedBigNumber } from '@/utils';

export interface NanoWalletConfig extends NanoRpcConfig {
	privateKey: string;
	representative: string;
	minAmountRaw?: string;
}

export interface ReceivableBlock {
	blockHash: string;
	amount: string;
}

interface Work {
	[hash: string]: {
		threshold: string;
		work: string;
	};
}

export interface NanoWalletState {
	balance: string;
	receivable: string;
	receivableBlocks: ReceivableBlock[];
	frontier: string | null;
	representative: string | null;
	works: Work;
}

export default class NanoWallet extends BaseController<
	NanoWalletConfig,
	NanoWalletState
> {
	rpc: NanoRPC;
	publicKey: string;
	account: string;

	defaultConfig = {
		rpcUrls: [],
		workerUrls: [],
		privateKey: null,
		representative: '',
		minAmountRaw: convert(MIN_AMOUNT.toString(), {
			from: Unit.NANO,
			to: Unit.raw,
		}),
		timeout: DEFAULT_TIMEOUT,
	} as any as NanoWalletConfig;

	defaultState: NanoWalletState = {
		balance: '0',
		receivable: '0',
		receivableBlocks: [],
		frontier: null,
		representative: null,
		works: {},
	};

	constructor(config: NanoWalletConfig, state?: NanoWalletState | null) {
		super(config, state || undefined);
		this.publicKey = derivePublicKey(config.privateKey);
		this.account = deriveAddress(this.publicKey, { useNanoPrefix: true });
		this.rpc = new NanoRPC({
			rpcUrls: config.rpcUrls,
			workerUrls: config.workerUrls,
			timeout: config.timeout,
		});
		this.initialize();
	}

	async sync() {
		try {
			const { balance, frontier, receivable, representative } =
				await this.rpc.accountInfo(this.account);
			await this.update({ balance, frontier, receivable, representative });
		} catch (error: any) {
			if (error.message !== 'Account not found') {
				throw error;
			}
		}
		await this.getReceivable();
	}

	private async workGenerate(hash: string, threshold: string) {
		const { work } = await this.rpc.workGenerate(hash, threshold);

		if (!work) {
			throw new Error('No work');
		}

		const isValidWork = validateWork({
			work,
			blockHash: hash,
			threshold,
		});

		if (!isValidWork) {
			throw new Error('Invalid work');
		}

		return work;
	}

	async getWork(hash: string, threshold: string) {
		if (
			hash in this.state.works &&
			parseInt(this.state.works[hash].threshold, 16) >= parseInt(threshold, 16)
		) {
			return this.state.works[hash].work;
		}
		const work = await this.workGenerate(hash, threshold);

		// TODO: Store the generated threshold, instead the requested one

		await this.update({
			works: {
				...this.state.works,
				[hash]: {
					threshold,
					work,
				},
			},
		});
		return work;
	}

	async getReceivable() {
		const { blocks = {} } = await this.rpc.receivable(this.account, {
			threshold: this.config.minAmountRaw,
		});
		let receivableBlocks: ReceivableBlock[] = [];
		let receivable = '0';
		for (const blockHash in blocks) {
			receivableBlocks.push({
				blockHash,
				amount: blocks[blockHash],
			});
			receivable = TunedBigNumber(receivable)
				.plus(blocks[blockHash])
				.toString();
		}
		await this.update({ receivableBlocks, receivable });
		return { receivableBlocks, receivable };
	}

	async receive(link: string) {
		link = link.toUpperCase();

		const amount = this.state.receivableBlocks.find(
			({ blockHash }) => blockHash === link,
		)?.amount;

		if (!amount) {
			throw new Error('No receivable block');
		}

		const balance = TunedBigNumber(this.state.balance).plus(amount).toString();

		const { block, hash } = createBlock(this.config.privateKey, {
			previous: this.state.frontier,
			representative: this.config.representative,
			balance,
			link,
			work: null,
		});

		const frontier = this.state.frontier || this.publicKey;

		const work = await this.getWork(frontier, RECEIVE_DIFFICULTY);

		const processed = await this.rpc.process({
			...block,
			work,
		});

		if (processed.hash !== hash) {
			throw new Error('Block hash mismatch');
		}

		const receivableBlocks = this.state.receivableBlocks.filter(
			({ blockHash }) => blockHash !== link,
		);
		const receivable = TunedBigNumber(this.state.receivable)
			.minus(amount)
			.toString();

		await this.update({
			balance,
			frontier: hash,
			receivableBlocks,
			receivable,
		});

		return { hash };
	}

	async send(to: string, amount: string) {
		if (this.state.frontier === null) {
			throw new Error('No frontier');
		}

		const balance = TunedBigNumber(this.state.balance).minus(amount).toString();

		const { block, hash } = createBlock(this.config.privateKey, {
			previous: this.state.frontier,
			representative: this.config.representative,
			balance,
			link: to,
			work: null,
		});

		const work = await this.getWork(this.state.frontier, SEND_DIFFICULTY);

		const processed = await this.rpc.process({
			...block,
			work,
		});

		if (processed.hash !== hash) {
			throw new Error('Block hash mismatch');
		}

		await this.update({
			balance,
			frontier: hash,
		});

		return { hash };
	}

	async sweep(to: string) {
		if (this.state.frontier === null) {
			throw new Error('No frontier');
		}

		const { block, hash } = createBlock(this.config.privateKey, {
			previous: this.state.frontier,
			representative: this.config.representative,
			balance: '0',
			link: to,
			work: null,
		});

		const work = await this.getWork(this.state.frontier, SEND_DIFFICULTY);

		const processed = await this.rpc.process({
			...block,
			work,
		});

		if (processed.hash !== hash) {
			throw new Error('Block hash mismatch');
		}

		await this.update({
			balance: '0',
			frontier: hash,
		});

		return { hash };
	}

	async setRepresentative(account?: string) {
		if (this.state.frontier === null) {
			throw new Error('No frontier');
		}

		const representative = account || this.config.representative;

		const { block, hash } = createBlock(this.config.privateKey, {
			previous: this.state.frontier,
			representative,
			balance: this.state.balance,
			link: null,
			work: null,
		});

		const work = await this.getWork(this.state.frontier, SEND_DIFFICULTY);

		const processed = await this.rpc.process({
			...block,
			work,
		});

		if (processed.hash !== hash) {
			throw new Error('Block hash mismatch');
		}

		await this.update({
			balance: '0',
			frontier: hash,
			representative,
		});

		this.configure({
			representative,
		});

		return { hash };
	}

	get balance() {
		return this.state.balance;
	}

	get receivable() {
		return this.state.receivable;
	}

	get receivableBlocks() {
		return this.state.receivableBlocks;
	}

	get frontier() {
		return this.state.frontier;
	}

	// Current representative may be different from the initialized representative
	// if after initialization of instance there has not yet been a new transaction or
	// .setRepresentative() has not been called yet.
	get currentRepresentative() {
		return this.state.representative;
	}
}
