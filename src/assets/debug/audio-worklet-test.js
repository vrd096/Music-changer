class TransposeDebugTestProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    return true;
  }
}

registerProcessor('transpose_debug_test', TransposeDebugTestProcessor);
