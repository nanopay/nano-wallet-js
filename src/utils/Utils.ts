import BigNumber from 'bignumber.js';

export const TunedBigNumber = BigNumber.clone({
	EXPONENTIAL_AT: 1e9,
	DECIMAL_PLACES: 36,
});

export interface FetchWithTimeoutOptions extends Omit<RequestInit, 'signal'> {
	timeout: number;
}

export const fetchWithTimeout = async (
	url: string,
	{ timeout, ...options }: FetchWithTimeoutOptions,
): Promise<Response> => {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);
	const response = await fetch(url, {
		...options,
		signal: controller.signal,
	});
	clearTimeout(timeoutId);
	return response;
};
