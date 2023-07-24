type LoggerLevel = 'info' | 'error';

export default class Logger {
	private name: string;
	private debug: boolean | undefined;

	constructor(name: string, debug?: boolean) {
		this.name = name;
		this.debug = debug;
	}

	private formatedDateTime() {
		const date = new Date();
		const year = date.getFullYear();
		const month = date.getMonth() + 1;
		const day = date.getDate();
		const hours = `0${date.getHours()}`.slice(-2);
		const minutes = `0${date.getMinutes()}`.slice(-2);
		const seconds = `0${date.getSeconds()}`.slice(-2);
		const milliseconds = `00${date.getMilliseconds()}`.slice(-3);
		return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
	}

	private formatMessage(data: any[], level: LoggerLevel): string {
		// Adding ANSI escape codes to display the error message in red
		const coloredLevel =
			level === 'error'
				? `\x1b[31m${level.toUpperCase()}\x1b[0m`
				: `\x1b[32m${level.toUpperCase()}\x1b[0m`;
		let prefix = `${this.formatedDateTime()} | ${coloredLevel}`;
		if (this.name) {
			prefix += ` | \u001b[1m${this.name}\u001b[0m`;
		}
		return `${prefix} | ${data.join(' ')}`;
	}

	info(...data: any[]) {
		if (this.debug) {
			console.log(this.formatMessage(data, 'info'));
		}
	}

	error(...data: any[]) {
		if (this.debug) {
			const errorMessage = this.formatMessage(data, 'error');
			console.log(`${errorMessage}`);
		}
	}
}
