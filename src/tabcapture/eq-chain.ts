export interface EqBand {
  type: BiquadFilterType;
  frequency: number;
  gain: number;
  Q: number;
}

export function createEqChain(audioContext: AudioContext): BiquadFilterNode[] {
  const bands: EqBand[] = [
    { type: 'highpass', frequency: 30, gain: 0, Q: 0.7 },
    { type: 'lowshelf', frequency: 120, gain: 0, Q: 0.7 },
    { type: 'peaking', frequency: 350, gain: 0, Q: 1 },
    { type: 'peaking', frequency: 1200, gain: 0, Q: 1 },
    { type: 'peaking', frequency: 3500, gain: 0, Q: 1 },
    { type: 'highshelf', frequency: 9000, gain: 0, Q: 0.7 },
  ];

  const filters: BiquadFilterNode[] = bands.map((band) => {
    const filter = audioContext.createBiquadFilter();
    filter.type = band.type;
    filter.frequency.value = band.frequency;
    filter.gain.value = band.gain;
    filter.Q.value = band.Q;
    return filter;
  });

  for (let index = 0; index < filters.length - 1; index++) {
    filters[index].connect(filters[index + 1]);
  }

  if (filters.length > 0) {
    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -3;
    compressor.knee.value = 0;
    compressor.ratio.value = 20;
    compressor.attack.value = 0.001;
    compressor.release.value = 0.05;
    filters[filters.length - 1].connect(compressor);
    compressor.connect(audioContext.destination);
  }

  return filters;
}

export function applyEqBands(
  eqFilters: BiquadFilterNode[],
  eqBands: EqBand[] | undefined,
  eqEnabled: boolean | undefined,
  audioContext: AudioContext | null,
): void {
  if (eqFilters.length && eqBands && audioContext) {
    for (let index = 0; index < eqFilters.length && index < eqBands.length; index++) {
      const filter = eqFilters[index];
      const band = eqBands[index];
      if (filter.type !== band.type) filter.type = band.type;
      if (filter.frequency.value !== band.frequency) filter.frequency.value = band.frequency;
      if (filter.Q.value !== band.Q) filter.Q.value = band.Q;
      const isPeakingOrShelving =
        band.type === 'peaking' || band.type === 'lowshelf' || band.type === 'highshelf';
      const gainVal = !isPeakingOrShelving || eqEnabled === false ? 0 : band.gain;
      if (filter.gain.value !== gainVal) filter.gain.value = gainVal;
    }
  }
}
