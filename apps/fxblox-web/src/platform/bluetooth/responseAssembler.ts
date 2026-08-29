/**
 * ResponseAssembler — the mobile `utils/ble.ts` framing logic (ble_header/ble_chunk one-shot responses and
 * ble_stream frames), kept pure over a `BleTransport`. The `writeToBLEAndWaitForResponse(command, peripheralId,
 * serviceUUID?, characteristicUUID?, timeout = 30000, onStreamFrame?)` signature is preserved so every ported
 * caller (api/wifi, api/bloxHardware, bleAiClient, useAiSession) compiles unchanged.
 *
 * Differences from mobile: no 2 s post-connect sleep and no retrieveServices retry here (the Web Bluetooth
 * `BleSession.attach()` owns the getPrimaryService retry), and the transport is resolved through
 * `BleRegistry` by peripheral id when none was injected.
 */
import type { BleCharacteristicRef, BleTransport } from './types';
import { BLE_COMMAND_CHARACTERISTIC_UUID, BLE_SERVICE_UUID, BleNoDeviceError } from './types';
import { encodeCommand } from './fragment';

export interface ChunkedResponse {
  type?: 'ble_header' | 'ble_chunk' | 'ble_stream';
  index?: number;
  total_length?: number;
  chunks?: number;
  data?: string;
  final?: boolean;
}

/**
 * One frame per token/event as produced by the blox-side SSE → BLE bridge. `final: true` on the last frame;
 * `data` is a JSON string payload per frame.
 */
export interface BleStreamFrame {
  type: 'ble_stream';
  index: number;
  data: string;
  final: boolean;
}

/** Accumulated result of a streamed command: ordered decoded frames + the payload of the `final` frame. */
export interface BleStreamResult {
  frames: unknown[];
  final: unknown;
}

/**
 * Thrown when a stream times out before its `final: true` frame. Carries the frames that DID arrive so the chat
 * UX can render a partial transcript.
 */
/**
 * A frame that looked like JSON and was not. Carries the raw text so a caller can report the length, which
 * is the tell for truncation.
 */
export class BleFrameError extends Error {
  public readonly raw: string;
  constructor(message: string, raw: string) {
    super(message);
    this.name = 'BleFrameError';
    this.raw = raw;
    Object.setPrototypeOf(this, BleFrameError.prototype);
  }
}

export class BleStreamTimeoutError extends Error {
  public readonly partialFrames: unknown[];
  constructor(message: string, partialFrames: unknown[]) {
    super(message);
    this.name = 'BleStreamTimeoutError';
    this.partialFrames = partialFrames;
    Object.setPrototypeOf(this, BleStreamTimeoutError.prototype);
  }
}

/** Structural type every BLE command writer satisfies (ResponseAssembler, mocks). */
export interface BleCommandWriter {
  writeToBLEAndWaitForResponse(
    command: string,
    peripheral: string,
    serviceUUID?: string,
    characteristicUUID?: string,
    timeout?: number,
    onStreamFrame?: (frame: unknown) => void,
  ): Promise<unknown>;
}

export type TransportResolver = (peripheralId: string) => BleTransport | null | undefined;

let defaultResolver: TransportResolver = () => null;

/** `BleRegistry` installs itself here so `new ResponseAssembler()` (no args) resolves devices by id. */
export function setDefaultTransportResolver(resolver: TransportResolver): void {
  defaultResolver = resolver;
}

const dec = new TextDecoder();

export class ResponseAssembler implements BleCommandWriter {
  private buffer: string[] = [];
  private expectedChunks = 0;
  private isReceivingChunks = false;
  private responsePromise: Promise<unknown> | null = null;
  private resolveResponse: ((value: unknown) => void) | null = null;

  private chunkCount = 0;

  private currentCommand: string | null = null;
  private commandResolve: ((value: unknown) => void) | null = null;
  private commandReject: ((reason?: unknown) => void) | null = null;
  private commandTimeout: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => Promise<void>) | null = null;

  // Streaming state — isolated per command. Reset on cleanupCommand() so a leftover stream from a prior command
  // can never bleed into the next.
  private isStreaming = false;
  private streamFrames: unknown[] = [];
  private onStreamFrame: ((frame: unknown) => void) | null = null;

  private readonly transport: BleTransport | null;

  constructor(transport?: BleTransport | null) {
    this.transport = transport ?? null;
  }

  private resolveTransport(peripheralId: string): BleTransport {
    if (this.transport) return this.transport;
    const t = defaultResolver(peripheralId);
    if (!t) throw new BleNoDeviceError(`No Bluetooth session for peripheral ${peripheralId}`);
    return t;
  }

  /** Feed a raw notification value (bytes) — the Web Bluetooth `characteristicvaluechanged` path. */
  onNotification(value: Uint8Array): void {
    if (!this.currentCommand) return;
    const stringValue = dec.decode(value);
    void this.handleResponse(stringValue).then((response) => {
      if (response !== null && response !== undefined) {
        if (this.commandResolve) {
          this.commandResolve(response);
          this.cleanupCommand();
        }
      }
    });
  }

  private cleanupCommand() {
    this.currentCommand = null;
    this.commandResolve = null;
    this.commandReject = null;
    if (this.commandTimeout) {
      clearTimeout(this.commandTimeout);
      this.commandTimeout = null;
    }
    // Reset stream state so the next command starts clean.
    this.isStreaming = false;
    this.streamFrames = [];
    this.onStreamFrame = null;
  }

  async writeToBLEAndWaitForResponse(
    command: string,
    peripheral: string,
    serviceUUID: string = BLE_SERVICE_UUID,
    characteristicUUID: string = BLE_COMMAND_CHARACTERISTIC_UUID,
    timeout: number = 30000,
    onStreamFrame?: (frame: unknown) => void,
  ): Promise<unknown> {
    if (this.currentCommand) {
      throw new Error('Another command is in progress');
    }
    const ref: BleCharacteristicRef = { serviceUUID, characteristicUUID };
    let transport: BleTransport;
    try {
      transport = this.resolveTransport(peripheral);
      this.currentCommand = command;
      this.onStreamFrame = onStreamFrame ?? null;
      this.reset();

      await transport.attach();
      this.unsubscribe = await transport.subscribe((value) => this.onNotification(value), ref);

      const commandPromise = new Promise<unknown>((resolve, reject) => {
        this.commandResolve = resolve;
        this.commandReject = reject;
        this.commandTimeout = setTimeout(() => {
          // The OUTER promise rejects on timeout — never resolves with a partial result — BUT the rejection
          // carries the frames that DID arrive so the chat UX can render a partial transcript.
          const partial = this.isStreaming ? this.streamFrames.slice() : [];
          reject(new BleStreamTimeoutError('Command timed out', partial));
          this.cleanupCommand();
        }, timeout);
      });

      // Mark the command promise handled (the timeout may fire while the write is still pending) and race the
      // write against it so a stuck GATT write cannot hang this call past the timeout.
      commandPromise.catch(() => undefined);
      await Promise.race([transport.write(encodeCommand(command), ref), commandPromise]);
      return await commandPromise;
    } catch (error) {
      console.error('Error in writeToBLEAndWaitForResponse:', error);
      throw error;
    } finally {
      const unsub = this.unsubscribe;
      this.unsubscribe = null;
      if (unsub) {
        try {
          await unsub();
        } catch (e) {
          console.error('Error stopping notifications:', e);
        }
      }
      this.cleanupCommand();
    }
  }

  async handleResponse(value: string): Promise<unknown> {
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        // Mid-assembly, an unparseable frame is a damaged or foreign frame, never the answer. Returning it
        // resolved the whole command with a raw string: `formatLogResponse` then rendered two empty section
        // headers and no error was surfaced.
        if (this.isReceivingChunks) {
          console.warn('Dropping an unparseable frame received mid-assembly:', value.slice(0, 80));
          return null;
        }
        // A frame that STARTS like JSON but does not parse is a damaged one — almost always cut short,
        // because a notification can only carry ATT_MTU-3 bytes and Web Bluetooth gives us no way to ask
        // for a bigger MTU the way the mobile app does with requestMTU(512). Handing the fragment back as
        // the answer is how a truncated `properties` reply surfaced as the useless "empty properties
        // response": say what actually happened instead, and say it now rather than after the timeout.
        const head = value.trimStart()[0];
        if (head === '{' || head === '[') {
          const err = new BleFrameError(
            `The Blox's reply arrived damaged — ${value.length} bytes that do not parse as JSON. ` +
              `It was most likely cut short in transit.`,
            value,
          );
          console.error(err.message, value.slice(0, 120));
          this.commandReject?.(err);
          this.cleanupCommand();
          return null;
        }
        // Genuinely not JSON: plenty of commands answer with a bare string ("Wifi connected!").
        console.log('Received non-JSON response:', value);
        return value;
      }

      if (Array.isArray(parsed) || typeof parsed !== 'object' || parsed === null) {
        console.log('Received direct response:', parsed);
        return parsed;
      }

      const frame = parsed as ChunkedResponse;

      // Streaming protocol: one frame per token/event with explicit `index` + `final: true` on the last frame.
      if (frame.type === 'ble_stream') {
        if (!this.isStreaming) {
          this.isStreaming = true;
          this.streamFrames = [];
        }

        // Each frame's `data` is itself a JSON-encoded payload. Decode it once per frame.
        let framePayload: unknown = frame.data;
        if (typeof frame.data === 'string') {
          try {
            framePayload = JSON.parse(frame.data);
          } catch {
            framePayload = frame.data;
          }
        }
        this.streamFrames.push(framePayload);

        // Deliver to consumer as soon as we have it; user-code exceptions can't kill the stream.
        if (this.onStreamFrame) {
          try {
            this.onStreamFrame(framePayload);
          } catch (cbErr) {
            console.error('onStreamFrame callback raised:', cbErr);
          }
        }

        if (frame.final === true) {
          const result: BleStreamResult = { frames: this.streamFrames, final: framePayload };
          if (this.commandResolve) {
            this.commandResolve(result);
          }
        }
        // null = "frame handled, don't resolve at the outer command level yet".
        return null;
      }

      if (frame.type === 'ble_header') {
        console.log(`Starting to receive chunked response with ${frame.chunks} chunks`);
        this.buffer = [];
        this.expectedChunks = frame.chunks || 0;
        this.chunkCount = 0;
        this.isReceivingChunks = true;

        this.responsePromise = new Promise((resolve) => {
          this.resolveResponse = resolve;
        });
        return this.responsePromise;
      }

      if (frame.type === 'ble_chunk' && this.isReceivingChunks) {
        this.chunkCount++;
        console.log(`Received chunk ${this.chunkCount}/${this.expectedChunks}`);

        this.buffer[frame.index || 0] = frame.data ?? '';

        if (this.buffer.filter(Boolean).length === this.expectedChunks) {
          console.log('All chunks received, assembling response');
          this.isReceivingChunks = false;
          const completeData = this.buffer.join('');
          this.buffer = [];

          let finalResponse: unknown;
          try {
            finalResponse = JSON.parse(completeData);
          } catch {
            finalResponse = completeData;
          }

          if (this.resolveResponse) {
            console.log('Resolving complete response');
            this.resolveResponse(finalResponse);
            this.resolveResponse = null;
            this.responsePromise = null;
          }
        }
        return null;
      }

      // Only a `ble_chunk` with no header of ours reaches here (the header branch above always returns), so
      // this is a chunk from some other exchange — most likely the late reply to a command that already timed
      // out. Notifications now stay enabled for the life of the connection, so nothing is lost in the gap
      // between commands; the cost is that such a frame reaches this assembler instead of being dropped by the
      // radio. Resolving the current command with it would splice one response into another.
      if (frame.type === 'ble_chunk') {
        console.warn('Dropping a stray chunk that belongs to another exchange');
        return null;
      }

      console.log('Received regular response with type:', frame.type);
      return parsed;
    } catch (error) {
      console.error('Error processing response:', error);
      this.reset(); // Reset state on error
      return null;
    }
  }

  reset() {
    this.buffer = [];
    this.expectedChunks = 0;
    this.chunkCount = 0;
    this.isReceivingChunks = false;
    this.responsePromise = null;
    this.resolveResponse = null;
  }

  cleanup() {
    const unsub = this.unsubscribe;
    this.unsubscribe = null;
    if (unsub) void unsub().catch(() => undefined);
    if (this.commandReject) {
      try {
        this.commandReject(new Error('ResponseAssembler cleaned up'));
      } catch {
        /* ignore */
      }
    }
    this.reset();
    this.cleanupCommand();
  }
}
