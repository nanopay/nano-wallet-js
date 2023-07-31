# nano-wallet-js

SDK for developers to create and interact with Nanocurrency wallets easily with Typescript or Javascript

## Why to use it ?

- Easy to use, no need to configure RPC calls
- Allows you to configure multiple RPC and Work Servers separately.
- Automatic fallback when a request fails
- Runtime agnostic: Compatible with Node.js, Browser, EDGE, Bun, Deno and others.
- Efficient and agnostic state management allows you to store the wallet state with your favorite tool and start the instance with the previous state.
- Safe and non-custodial: Your privateKey is never shared with RPC or any server, all signatures and key derivation is made on client side by [nanocurrency.js library](https://github.com/marvinroger/nanocurrency-js)

## How to use it

#### Install nano-wallet-js package

```
npm install nano-wallet-js
```

#### Init the Wallet instance and sync:

```js
import NanoWallet from 'nano-wallet-js';

const config = {
	privateKey: '000AAFF...', // The privateKey (secret) of your wallet (not the SEED, neither the MNEMONIC)
	rpcUrls: ['http://[::1]:7076'], // A string or an array of RPC addresses
	workerUrls: ['http://[::1]:7076'], // A string or an array of RPC Worker Server. Can be the same as rpcUrls
	representative:
		'nano_3kc8wwut3u8g1kwa6x4drkzu346bdbyqzsn14tmabrpeobn8igksfqkzajbb', // representative account
	debug: true, // show console log message (optional)
};

const wallet = new NanoWallet(config);

await wallet.sync();
```

#### Optionally, init with a state:

```js
// It is only needed at wallet initialization.
// You can use a Database, Filesystem, KV, Redux or whatever...
const state = await getFromMyStorage();

const wallet = new NanoWallet(config, state);

// Subscribe to state changes to persist in your storage
wallet.subscribe(async state => {
	await saveIntoMyStorage(state);
});
```

### Properties:

- `wallet.account`: Your wallet account / address
- `wallet.balance`: Your wallet balance in raws
- `wallet.receivable`: Total amount to be received
- `wallet.receivableBlocks`: Array of pending blocks to receive with blockHash and amount
- `wallet.frontier`: Previous block hash (your last transaction)
- `wallet.representative`: The representative you set when initing the instance
- `wallet.currentRepresentative`: Your current representative. Make a transaction or call `.setRepresentative()` to update.

### Methods:

**Sync**: Force wallet synchronization, updating frontier, balance, receivable and representative.

```js
await wallet.sync();
console.log(wallet.frontier, wallet.balance, ...)
```

**Get Receivables**:
Returns an array containing the blocks that have not been received yet by this account. Each block contains
the `hash` property which you need to receive it using **Receive**.

```js
await wallet.getReceivable();
console.log(wallet.receivable, wallet.receivableBlocks);
```

**Receive**: Receive amount manually. This process will be automated in next releases.

```js
for (const receivable of wallet.receivableBlocks) {
	const { hash } = await wallet.receive(receivables.blockHash);
}
```

**Send**: Send amount in raws to another wallet.

```js
const to = 'nano_1abcd...';
const amount = '1000000000000000000000000000'; // 0.001 Nano
const { hash } = await wallet.send(to, amount);

// print the updated balance
console.log('Balance:', wallet.balance);
```

**Sweep**: Send all balance to another wallet (Careful!)

```js
const to = 'nano_3efgh...';
const { hash } = await wallet.sweep(to);
```

**Set Representative**: Set a new representative

```js
const rep = 'nano_4ijk1mno...';
await wallet.setRepresentative(rep);

// print
console.log(wallet.representative, wallet.currentRepresentative);
```

More methods soon...

## Attention!

This is a pre-release, not recommended for production use yet.

## Donate Ӿ

If you find this library useful and want to support its development please consider donating:
**nano_3dqh8z8ncswmf7151gryu7mqpwbw4f68hi7d8g433omtuabfi438etyyp9ik**

<kbd><img src="https://i.ibb.co/Gs6yhv2/nano-wallet-js-qr-code.png" width="200px" height="200px" /></kbd>
