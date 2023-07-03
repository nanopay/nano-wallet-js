'use strict';

import NanoWallet from './WalletController';

describe('Init Wallet', () => {
	const privateKey =
		'FD9AB9D1EBBE5FBF5B6B784635AAF9E94D08E2582D4E5172AFDF5FAD3400C37B';
	const wallet = new NanoWallet(
		{
			privateKey,
			rpcUrls: [],
			workerUrls: [],
			representative:
				'nano_3kc8wwut3u8g1kwa6x4drkzu346bdbyqzsn14tmabrpeobn8igksfqkzajbb',
		},
		null,
	);

	it('should import the correct wallet address', () => {
		expect(wallet.account).toBe(
			'nano_1e7mhkcbsh5b4yz5b4y3u9ncr7koohrh3amnmiutxaph7dw7yxnxfreg6qn5',
		);
	});
});
