import CONFIG from "../config.js";

class MFCCExtractor {
  constructor() {
    this.filterbankCache = new Map();
  }

  extract(inputBuffer, sampleRate) {
    if (!inputBuffer || !inputBuffer.length || !sampleRate) {
      return null;
    }

    const cfg = CONFIG.mfcc || {};

    const coefficientCount = cfg.coefficientCount || 13;
    const filterCount = cfg.filterCount || 26;
    const fftSize = cfg.fftSize || 2048;
    const minFreq = cfg.minFreq || 80;
    const maxFreq = Math.min(cfg.maxFreq || 7600, sampleRate / 2 - 1);
    const preEmphasis = cfg.preEmphasis ?? 0.97;

    const frame = this.prepareFrame(inputBuffer, fftSize, preEmphasis);

    if (!frame) {
      return null;
    }

    const spectrum = this.powerSpectrum(frame);
    const filterbank = this.getMelFilterbank({
      sampleRate,
      fftSize,
      filterCount,
      minFreq,
      maxFreq
    });

    const logMelEnergies = this.applyMelFilterbank(spectrum, filterbank);
    const mfcc = this.dct(logMelEnergies, coefficientCount);

    if (!mfcc || mfcc.some((value) => !Number.isFinite(value))) {
      return null;
    }

    return mfcc;
  }

  prepareFrame(inputBuffer, fftSize, preEmphasis) {
    const frameSize = Math.min(fftSize, inputBuffer.length);
    const start = Math.max(0, inputBuffer.length - frameSize);

    let maxAbs = 0;
    const frame = new Float32Array(fftSize);

    let previousSample = 0;

    for (let i = 0; i < frameSize; i += 1) {
      const raw = inputBuffer[start + i] || 0;
      const emphasized = raw - preEmphasis * previousSample;
      previousSample = raw;

      const windowValue = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (frameSize - 1));
      const value = emphasized * windowValue;

      frame[i] = value;

      const abs = Math.abs(value);
      if (abs > maxAbs) {
        maxAbs = abs;
      }
    }

    if (maxAbs < 0.00001) {
      return null;
    }

    return frame;
  }

  powerSpectrum(frame) {
    const fftResult = this.fftReal(frame);
    const halfSize = frame.length / 2;
    const spectrum = new Float32Array(halfSize + 1);

    for (let i = 0; i <= halfSize; i += 1) {
      const real = fftResult.real[i];
      const imag = fftResult.imag[i];
      spectrum[i] = (real * real + imag * imag) / frame.length;
    }

    return spectrum;
  }

  fftReal(input) {
    const n = input.length;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);

    real.set(input);

    let j = 0;
    for (let i = 1; i < n; i += 1) {
      let bit = n >> 1;

      while (j & bit) {
        j ^= bit;
        bit >>= 1;
      }

      j ^= bit;

      if (i < j) {
        const tempReal = real[i];
        real[i] = real[j];
        real[j] = tempReal;

        const tempImag = imag[i];
        imag[i] = imag[j];
        imag[j] = tempImag;
      }
    }

    for (let length = 2; length <= n; length <<= 1) {
      const angle = (-2 * Math.PI) / length;
      const wLengthReal = Math.cos(angle);
      const wLengthImag = Math.sin(angle);

      for (let i = 0; i < n; i += length) {
        let wReal = 1;
        let wImag = 0;
        const halfLength = length >> 1;

        for (let k = 0; k < halfLength; k += 1) {
          const evenIndex = i + k;
          const oddIndex = i + k + halfLength;

          const oddReal = real[oddIndex] * wReal - imag[oddIndex] * wImag;
          const oddImag = real[oddIndex] * wImag + imag[oddIndex] * wReal;

          const evenReal = real[evenIndex];
          const evenImag = imag[evenIndex];

          real[evenIndex] = evenReal + oddReal;
          imag[evenIndex] = evenImag + oddImag;

          real[oddIndex] = evenReal - oddReal;
          imag[oddIndex] = evenImag - oddImag;

          const nextWReal = wReal * wLengthReal - wImag * wLengthImag;
          const nextWImag = wReal * wLengthImag + wImag * wLengthReal;

          wReal = nextWReal;
          wImag = nextWImag;
        }
      }
    }

    return {
      real,
      imag
    };
  }

  getMelFilterbank({ sampleRate, fftSize, filterCount, minFreq, maxFreq }) {
    const cacheKey = `${sampleRate}-${fftSize}-${filterCount}-${minFreq}-${maxFreq}`;

    if (this.filterbankCache.has(cacheKey)) {
      return this.filterbankCache.get(cacheKey);
    }

    const minMel = this.hzToMel(minFreq);
    const maxMel = this.hzToMel(maxFreq);

    const melPoints = [];

    for (let i = 0; i < filterCount + 2; i += 1) {
      const mel = minMel + ((maxMel - minMel) * i) / (filterCount + 1);
      melPoints.push(mel);
    }

    const hzPoints = melPoints.map((mel) => this.melToHz(mel));
    const binPoints = hzPoints.map((hz) => {
      return Math.max(0, Math.min(Math.floor(((fftSize + 1) * hz) / sampleRate), fftSize / 2));
    });

    const filters = [];
    const spectrumSize = fftSize / 2 + 1;

    for (let filterIndex = 1; filterIndex <= filterCount; filterIndex += 1) {
      const filter = new Float32Array(spectrumSize);

      const left = binPoints[filterIndex - 1];
      const center = binPoints[filterIndex];
      const right = binPoints[filterIndex + 1];

      for (let bin = left; bin < center; bin += 1) {
        if (center !== left) {
          filter[bin] = (bin - left) / (center - left);
        }
      }

      for (let bin = center; bin < right; bin += 1) {
        if (right !== center) {
          filter[bin] = (right - bin) / (right - center);
        }
      }

      filters.push(filter);
    }

    this.filterbankCache.set(cacheKey, filters);

    return filters;
  }

  applyMelFilterbank(spectrum, filterbank) {
    const epsilon = 1e-10;
    const energies = new Float32Array(filterbank.length);

    filterbank.forEach((filter, filterIndex) => {
      let energy = 0;

      for (let i = 0; i < spectrum.length; i += 1) {
        energy += spectrum[i] * filter[i];
      }

      energies[filterIndex] = Math.log(Math.max(energy, epsilon));
    });

    return energies;
  }

  dct(values, coefficientCount) {
    const n = values.length;
    const result = new Array(coefficientCount).fill(0);

    for (let coefficientIndex = 0; coefficientIndex < coefficientCount; coefficientIndex += 1) {
      let sum = 0;

      for (let i = 0; i < n; i += 1) {
        sum += values[i] * Math.cos((Math.PI * coefficientIndex * (i + 0.5)) / n);
      }

      const scale = coefficientIndex === 0
        ? Math.sqrt(1 / n)
        : Math.sqrt(2 / n);

      result[coefficientIndex] = sum * scale;
    }

    return result;
  }

  hzToMel(hz) {
    return 2595 * Math.log10(1 + hz / 700);
  }

  melToHz(mel) {
    return 700 * (10 ** (mel / 2595) - 1);
  }
}

export default MFCCExtractor;
