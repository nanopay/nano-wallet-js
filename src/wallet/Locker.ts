export default class Locker {
	isLocked = false;
	private queue: ((value: unknown) => void)[] = [];

	async acquire() {
		if (!this.isLocked) {
			this.isLocked = true;
			return;
		}

		return new Promise(resolve => {
			this.queue.push(resolve);
		});
	}

	release() {
		if (this.queue.length > 0) {
			const nextResolve = this.queue.shift();
			nextResolve && nextResolve(true);
		} else {
			this.isLocked = false;
		}
	}
}
