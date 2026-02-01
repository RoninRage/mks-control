export const logger = {
  log: (...args: unknown[]): void => {
    if (import.meta.env.DEV) {
      console.log(...args);
    }
  },
};
