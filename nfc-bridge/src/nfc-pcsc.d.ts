declare module 'nfc-pcsc' {
  export class Reader {
    name: string;
    on(event: 'card', listener: (card: { uid?: string }) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: 'end', listener: () => void): this;
    close(): void;
  }

  export class NFC {
    on(event: 'reader', listener: (reader: Reader) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    close(): void;
  }
}
