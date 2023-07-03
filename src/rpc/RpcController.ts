import { BlockRepresentation } from 'nanocurrency';
import { fetchWithTimeout } from '@/utils';
import {
	AccountBalanceResponse,
	AccountInfoResponse,
	ReceivableWithThreshold,
} from './RpControllerc.types';
import { DEFAULT_TIMEOUT } from '@/Constants';

export interface NanoRpcConfig {
	rpcUrls: string | string[];
	workerUrls: string | string[];
	timeout?: number;
}

interface WorkGenerateResponse {
	work: string;
	difficulty: string;
	multiplier: string;
	hash: string;
}

interface ProcessResponse {
	hash: string;
}

export default class NanoRPC {
	rpcUrls: string[];
	workerUrls: string[];
	timeout: number;

	constructor({
		rpcUrls,
		workerUrls,
		timeout = DEFAULT_TIMEOUT,
	}: NanoRpcConfig) {
		this.rpcUrls = rpcUrls instanceof Array ? rpcUrls : [rpcUrls];
		if (this.rpcUrls.length < 0) {
			throw new Error('No RPC addresses provided');
		}
		this.rpcUrls.forEach(addr => {
			try {
				new URL(addr);
			} catch (err) {
				throw new Error(`Invalid RPC address: ${addr}`);
			}
		});
		this.workerUrls = workerUrls instanceof Array ? workerUrls : [workerUrls];
		if (this.workerUrls.length < 0) {
			throw new Error('No workers addresses provided');
		}
		this.workerUrls.forEach(addr => {
			try {
				new URL(addr);
			} catch (err) {
				throw new Error(`Invalid workers address: ${addr}`);
			}
		});
		this.timeout = timeout;
	}

	async postRPC<TRPCResponse = unknown>(
		data: any,
		urls = this.rpcUrls,
		retry = 0,
	): Promise<TRPCResponse> {
		const url = urls[retry];
		try {
			const response = await fetchWithTimeout(url, {
				method: 'POST',
				body: JSON.stringify(data),
				headers: {
					'Content-Type': 'application/json',
				},
				timeout: this.timeout,
			});

			if (!response.ok) {
				console.error(
					`RPC Error - Bad Status: ${response.status} ${response.statusText}`,
				);
				throw new Error('bad status');
			}

			const body = await response.json();

			if (typeof body === 'object' && 'error' in body) {
				console.error(`RPC Error: ${body.error}`);
				throw new Error(body.error);
			}

			return body as TRPCResponse;
		} catch (error: any) {
			const isRetryableError =
				(error instanceof SyntaxError &&
					error.message.startsWith('SyntaxError')) ||
				(error instanceof DOMException && error.name === 'AbortError') ||
				error.message === 'bad status';

			if (isRetryableError && retry < urls.length - 1) {
				return await this.postRPC(data, urls, retry + 1);
			}

			throw error;
		}
	}

	async process(block: BlockRepresentation) {
		const data = {
			action: 'process',
			json_block: 'true',
			block,
		};
		return this.postRPC<ProcessResponse>(data);
	}

	async workGenerate(hash: string, difficulty: string) {
		const data = {
			action: 'work_generate',
			hash,
			difficulty,
		};
		return this.postRPC<WorkGenerateResponse>(data, this.workerUrls);
	}

	async accountInfo(account: string) {
		const data = {
			action: 'account_info',
			account,
			representative: true,
			weight: true,
			receivable: true,
		};
		return this.postRPC<AccountInfoResponse>(data);
	}

	async accountBalance(account: string) {
		const data = {
			action: 'account_balance',
			account,
			receivable: true,
		};
		return this.postRPC<AccountBalanceResponse>(data);
	}

	async receivable(account: string, { count = 100, threshold = '1' }) {
		const data = {
			action: 'receivable',
			account,
			count,
			threshold,
		};
		return this.postRPC<ReceivableWithThreshold>(data);
	}
}
