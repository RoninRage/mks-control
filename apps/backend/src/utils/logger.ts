export const logger = {
  log: (...args: unknown[]): void => {
    if (process.env.NODE_ENV === 'development') {
      console.log(...args);
    }
  },
};
