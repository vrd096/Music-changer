/**
 * CaptureProcessor — passthrough AudioWorkletProcessor.
 *
 * Пропускает аудио без изменений (input → output) для ВСЕХ каналов и отправляет
 * копии аудио-чанков (первый канал) в main thread через port.postMessage().
 */

const HOP_SIZE = 512;

class CaptureProcessor extends AudioWorkletProcessor {
  constructor(_options) {
    super();
    this.buffer = new Float32Array(HOP_SIZE);
    this.offset = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input[0]) {
      const numOutCh = output ? output.length : 1;
      for (let ch = 0; ch < numOutCh; ch++) {
        if (output && output[ch]) output[ch].fill(0);
      }
      return true;
    }

    const numCh = Math.max(input.length, output ? output.length : 1);

    for (let ch = 0; ch < numCh; ch++) {
      const inCh = input[Math.min(ch, input.length - 1)];
      const outCh = output ? output[Math.min(ch, output.length - 1)] : null;
      if (inCh && outCh) {
        outCh.set(inCh);
      } else if (outCh) {
        outCh.fill(0);
      }
    }

    const samples = input[0];
    let written = 0;
    while (written < samples.length) {
      const space = HOP_SIZE - this.offset;
      const chunk = Math.min(space, samples.length - written);

      this.buffer.set(samples.subarray(written, written + chunk), this.offset);
      this.offset += chunk;
      written += chunk;

      if (this.offset >= HOP_SIZE) {
        const frame = new Float32Array(this.buffer);
        this.port.postMessage({ type: 'audio', samples: frame });
        this.offset = 0;
      }
    }

    return true;
  }
}

registerProcessor('capture-processor', CaptureProcessor);
