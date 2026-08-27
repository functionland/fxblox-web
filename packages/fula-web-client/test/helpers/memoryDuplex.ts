/**
 * In-memory ByteDuplex pair that emulates kubo's `p2p listen` forwarder semantics:
 *
 *   - the CLIENT half-closing its write side FULL-closes the stream: the server's reader sees EOF *and* anything
 *     the server writes afterwards is dropped, *and* the client's own reader is ended with whatever had already
 *     arrived (kubo closes both the libp2p stream and the TCP side of the forwarder).
 *   - the SERVER closing its write side simply ends the client's reader (Go's `Connection: close` behaviour).
 */
import type { ByteDuplex } from '../../src/core/httpOverStream.js';

class Inbox {
  private readonly queue: Uint8Array[] = [];
  private waiter: (() => void) | undefined;
  private ended = false;
  private error: Error | undefined;

  push(chunk: Uint8Array): void {
    if (this.ended) return; // dropped: the other side is gone
    this.queue.push(chunk);
    this.wake();
  }

  end(err?: Error): void {
    if (this.ended) return;
    this.ended = true;
    this.error = err;
    this.wake();
  }

  private wake(): void {
    const w = this.waiter;
    this.waiter = undefined;
    w?.();
  }

  async *iterate(): AsyncIterable<Uint8Array> {
    for (;;) {
      const next = this.queue.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      if (this.ended) {
        if (this.error !== undefined) throw this.error;
        return;
      }
      await new Promise<void>((resolve) => {
        this.waiter = resolve;
      });
    }
  }
}

export interface KuboPair {
  client: ByteDuplex;
  server: ByteDuplex;
  /** True once the client half-closed and the forwarder tore the stream down. */
  readonly tornDown: () => boolean;
}

export function createKuboPair(): KuboPair {
  const toServer = new Inbox();
  const toClient = new Inbox();
  let tornDown = false;

  const teardown = (err?: Error): void => {
    tornDown = true;
    toServer.end(err);
    toClient.end(err);
  };

  const client: ByteDuplex = {
    async write(data) {
      if (tornDown) throw new Error('stream closed');
      toServer.push(data);
    },
    read: () => toClient.iterate(),
    async close() {
      // kubo: client half-close → full close of the forwarder stream
      teardown();
    },
    abort(err) {
      teardown(err);
    },
  };

  const server: ByteDuplex = {
    async write(data) {
      if (tornDown) return; // silently dropped, as the real forwarder would
      toClient.push(data);
    },
    read: () => toServer.iterate(),
    async close() {
      toClient.end();
    },
    abort(err) {
      teardown(err);
    },
  };

  return { client, server, tornDown: () => tornDown };
}
