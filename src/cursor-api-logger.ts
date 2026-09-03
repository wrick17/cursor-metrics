type Logger = (msg: string) => void;

let log: Logger = () => {};

export function configure(opts: { logger: Logger }) {
  log = opts.logger;
}

export function apiLog(msg: string) {
  log(msg);
}
