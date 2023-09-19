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
import Logger from '@/logger/Logger';

export interface NanoWalletConfig extends NanoRpcConfig {
	privateKey: string;
	representative: string;
	minAmountRaw?: string;
	precomputeWork?: boolean;
}

export interface ReceivableBlock {
	blockHash: string;
	amount: string;
}

interface Work {
	hash: string;
	threshold: string;
	work: string;
}

export interface NanoWalletState {
	balance: string;
	receivable: string;
	receivableBlocks: ReceivableBlock[];
	frontier: string | null;
	representative: string | null;
	work: Work | null;
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
		precomputeWork: true,
		minAmountRaw: convert(MIN_AMOUNT.toString(), {
			from: Unit.NANO,
			to: Unit.raw,
		}),
		timeout: DEFAULT_TIMEOUT,
		debug: false,
	} as any as NanoWalletConfig;

	defaultState: NanoWalletState = {
		balance: '0',
		receivable: '0',
		receivableBlocks: [],
		frontier: null,
		representative: null,
		work: null,
	};

	logger: Logger;

	constructor(config: NanoWalletConfig, state?: NanoWalletState | null) {
		super(config, state || undefined);
		this.publicKey = derivePublicKey(config.privateKey);
		this.account = deriveAddress(this.publicKey, { useNanoPrefix: true });
		this.logger = new Logger('NANO_WALLET', config.debug);
		this.logger.info(`Imported account: ${this.account}`);
		this.initialize();
		this.rpc = new NanoRPC({
			rpcUrls: this.config.rpcUrls,
			workerUrls: this.config.workerUrls,
			timeout: this.config.timeout,
			debug: this.config.debug,
		});
		let previousFrontier = this.state.frontier;
		if (this.config.precomputeWork) {
			this.subscribe(state => {
				if (state.work && state.work.hash !== state.frontier) {
					this.update({ work: null });
				}
				if (
					state.frontier &&
					state.frontier !== previousFrontier &&
					(!state.work || state.work.hash !== state.frontier)
				) {
					this.logger.info('Precomputing Work for', state.frontier);
					this.getWork(state.frontier, SEND_DIFFICULTY);
				}
				previousFrontier = state.frontier;
			});
		}
	}

	async sync() {
		try {
			const { balance, frontier, receivable, representative } =
				await this.rpc.accountInfo(this.account);
			this.logger.info(
				`Wallet Sync! Balance: ${convert(balance, {
					from: Unit.raw,
					to: Unit.NANO,
				})} NANO. Receivable: ${convert(receivable, {
					from: Unit.raw,
					to: Unit.NANO,
				})}`,
			);
			this.update({ balance, frontier, receivable, representative });
			await this.getReceivable();
		} catch (error: any) {
			if (error.message !== 'Account not found') {
				this.logger.error(
					'sync:',
					error instanceof Error ? error.message : error,
				);
				throw error;
			}
		}
	}

	private async workGenerate(hash: string, threshold: string) {
		try {
			const startedAt = Date.now();

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

			this.logger.info(
				`Generated Work for ${hash} in ${Date.now() - startedAt} ms`,
			);

			return work;
		} catch (error) {
			this.logger.error(
				'workGenerate:',
				error instanceof Error ? error.message : error,
			);
			throw error;
		}
	}

	private async getWork(hash: string, threshold: string) {
		if (
			this.state.work?.hash === hash &&
			parseInt(this.state.work.threshold, 16) >= parseInt(threshold, 16)
		) {
			this.logger.info(`Using precomputed Work for ${hash}`);
			return this.state.work.work;
		}
		const work = await this.workGenerate(hash, threshold);

		// TODO: Store the generated threshold, instead the requested one

		this.update({
			work: {
				hash,
				threshold,
				work,
			},
		});
		return work;
	}

	async getReceivable() {
		try {
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
			this.logger.info(
				`${convert(receivable, {
					from: Unit.raw,
					to: Unit.NANO,
				})} NANO to receive from ${receivableBlocks.length} blocks`,
			);
			this.update({ receivableBlocks, receivable });
			return { receivableBlocks, receivable };
		} catch (error) {
			this.logger.error(
				'getReceivable',
				error instanceof Error ? error.message : error,
			);
			throw error;
		}
	}

	async receive(link: string) {
		try {
			link = link.toUpperCase();

			const amount = this.state.receivableBlocks.find(
				({ blockHash }) => blockHash === link,
			)?.amount;

			if (!amount) {
				throw new Error('No receivable block');
			}

			const balance = TunedBigNumber(this.state.balance)
				.plus(amount)
				.toString();

			this.logger.info(
				`Receiving ${convert(amount, {
					from: Unit.raw,
					to: Unit.NANO,
				})} NANO from block ${link}`,
			);

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

			this.update({
				balance,
				frontier: hash,
				receivableBlocks,
				receivable,
			});

			return { hash };
		} catch (error) {
			this.logger.error(
				'receive:',
				error instanceof Error ? error.message : error,
			);
			throw error;
		}
	}

	async send(to: string, amount: string) {
		try {
			if (this.state.frontier === null) {
				throw new Error('No frontier');
			}

			const balance = TunedBigNumber(this.state.balance)
				.minus(amount)
				.toString();

			this.logger.info(
				`Sending ${convert(amount, {
					from: Unit.raw,
					to: Unit.NANO,
				})} NANO to ${to}`,
			);

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

			this.update({
				balance,
				frontier: hash,
			});

			return { hash };
		} catch (error) {
			this.logger.error(
				'send:',
				error instanceof Error ? error.message : error,
			);
			throw error;
		}
	}

	async sweep(to: string) {
		try {
			if (this.state.frontier === null) {
				throw new Error('No frontier');
			}

			this.logger.info(`Sweeping all funds from ${this.account} to ${to}`);

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

			this.update({
				balance: '0',
				frontier: hash,
			});

			return { hash };
		} catch (error) {
			this.logger.error(
				'sweep:',
				error instanceof Error ? error.message : error,
			);
			throw error;
		}
	}

	async setRepresentative(account?: string) {
		try {
			if (this.state.frontier === null) {
				throw new Error('No frontier');
			}

			this.logger.info(`Setting representative: ${account}`);

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

			this.update({
				balance: '0',
				frontier: hash,
				representative,
			});

			this.configure({
				representative,
			});

			return { hash };
		} catch (error) {
			this.logger.error(
				'setRepresentative:',
				error instanceof Error ? error.message : error,
			);
			throw error;
		}
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
