import { BlockRepresentation } from 'nanocurrency';
import { fetchWithTimeout } from '@/utils';
import {
	AccountBalanceResponse,
	AccountInfoResponse,
	ProcessResponse,
	ReceivableWithThresholdResponse,
	WorkGenerateResponse,
} from './RpControllerc.types';
import { DEFAULT_TIMEOUT } from '@/Constants';
import Logger from '../logger';

const LOG_REQUEST_RESPONSE = false;

export interface NanoRpcConfig {
	rpcUrls: string | string[];
	workerUrls: string | string[];
	timeout?: number;
	debug?: boolean;
}

export default class NanoRPC {
	rpcUrls: string[];
	workerUrls: string[];
	timeout: number;
	private logger: Logger;

	constructor({
		rpcUrls,
		workerUrls,
		timeout = DEFAULT_TIMEOUT,
		debug = false,
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
		this.logger = new Logger('NANO_RPC', debug);
	}

	async postRPC<TRPCResponse = unknown>(
		data: any,
		urls = this.rpcUrls,
		retry = 0,
	): Promise<TRPCResponse> {
		const url = urls[retry];
		const startedAt = Date.now();
		try {
			const response = await fetchWithTimeout(url, {
				method: 'POST',
				body: JSON.stringify(data),
				headers: {
					'Content-Type': 'application/json',
				},
				timeout: this.timeout,
			});

			const took = Date.now() - startedAt;

			if (!response?.ok) {
				this.logger.error(
					`url: ${url} | action: ${data.action} | status: ${response.status} (${response.statusText}) | took: ${took}ms`,
					LOG_REQUEST_RESPONSE
						? `\n\t- Request: ${JSON.stringify(
								data,
						  )}\n\t- Response: ${JSON.stringify(await response.text())}`
						: '',
				);
				throw new Error('bad status in response');
			}

			let body;

			// clone, so we can consume the body if response.json() fails
			const responseClone = new Response(response.body, response);

			try {
				body = await response.json();
			} catch (err) {
				this.logger.error(
					`url: ${url} | action: ${data.action} | status: bad json in response | took: ${took}ms`,
					LOG_REQUEST_RESPONSE
						? `\n\t- Request: ${JSON.stringify(
								data,
						  )}\n\t- Response: ${await responseClone.text()}`
						: '',
				);
				throw new Error('bad json in response');
			}

			if (typeof body === 'object' && body !== null && 'error' in body) {
				if (typeof body.error === 'string') {
					throw new Error(body.error);
				} else {
					throw new Error(JSON.stringify(body.error));
				}
			}

			this.logger.info(
				`url: ${url} | action: ${data.action} | status: ${response.status} | took: ${took}ms`,
				LOG_REQUEST_RESPONSE
					? `\n\t- Request: ${JSON.stringify(
							data,
					  )}\n\t- Response: ${JSON.stringify(body)}`
					: '',
			);

			return body as TRPCResponse;
		} catch (error: any) {
			const isRetryableError =
				error instanceof DOMException &&
				(error.name === 'AbortError' ||
					error.message === 'bad status in response' ||
					error.message === 'bad json in response');

			const canRetry = isRetryableError && retry < urls.length - 1;

			if (error instanceof DOMException && error.name === 'AbortError') {
				const took = Date.now() - startedAt;
				this.logger.error(
					`url: ${url} | action: ${data.action} | status: ${error.message} | took: ${took}ms | will retry: ${canRetry}`,
					LOG_REQUEST_RESPONSE ? `\n\t- Request: ${JSON.stringify(data)}` : '',
				);
			}

			if (canRetry) {
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
		return this.postRPC<ReceivableWithThresholdResponse>(data);
	}
}
