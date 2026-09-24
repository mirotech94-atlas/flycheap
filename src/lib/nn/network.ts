/**
 * A small neural network, written out in full so it can be read.
 *
 * This is a multilayer perceptron: a row of inputs, one or two hidden layers,
 * and an output layer that gives a probability for each decision. No
 * dependency — FlyCheap's decisions are a handful of numbers per route, and a
 * network this size trains in seconds on the server and predicts in
 * microseconds. Anything heavier would be paying for capacity we cannot use
 * with 24 routes of history.
 *
 * Vocabulary, so the rest of the file needs no ML background:
 *   - a "layer" is a matrix of weights plus a bias per neuron
 *   - "forward" pushes inputs through the layers to get an output
 *   - "loss" is how wrong the output was against the known answer
 *   - "backward" works out how much each weight contributed to that loss
 *   - "step" nudges every weight a little in the direction that reduces it
 * Training is forward → loss → backward → step, thousands of times.
 */

export type Activation = 'relu' | 'sigmoid' | 'softmax';

export type LayerSpec = { size: number; activation: Activation };

export type NetworkSpec = {
  inputs: number;
  /** Hidden layers then the output layer. The output layer's activation
   *  should be 'softmax' for a choice between classes, 'sigmoid' for a
   *  yes/no probability. */
  layers: LayerSpec[];
};

/** Everything needed to rebuild a trained network. JSON-serialisable so it
 *  can sit in a table and be loaded by the app without retraining. */
export type NetworkWeights = {
  spec: NetworkSpec;
  /** weights[l][j][i] = weight from input i to neuron j of layer l */
  weights: number[][][];
  biases: number[][];
};

// ---- activations ---------------------------------------------------------

function relu(x: number): number { return x > 0 ? x : 0; }
function reluGrad(x: number): number { return x > 0 ? 1 : 0; }
function sigmoid(x: number): number { return 1 / (1 + Math.exp(-x)); }

function softmax(z: number[]): number[] {
  // Subtract the max first: exp() of a large number overflows to Infinity.
  const m = Math.max(...z);
  const e = z.map(v => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map(v => v / s);
}

// ---- a deterministic random source, so training is reproducible ----------

/** Mulberry32: a tiny seeded PRNG. Same seed, same weights, same model. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- the network ---------------------------------------------------------

export class Network {
  readonly spec: NetworkSpec;
  weights: number[][][];
  biases: number[][];

  constructor(spec: NetworkSpec, seed = 42) {
    this.spec = spec;
    const rnd = seededRandom(seed);
    this.weights = [];
    this.biases = [];
    let fanIn = spec.inputs;
    for (const layer of spec.layers) {
      // "He" initialisation: weights scaled by the number of inputs so the
      // signal neither dies nor explodes as it passes through the layers.
      const scale = Math.sqrt(2 / fanIn);
      this.weights.push(Array.from({ length: layer.size }, () =>
        Array.from({ length: fanIn }, () => (rnd() * 2 - 1) * scale)));
      this.biases.push(new Array(layer.size).fill(0));
      fanIn = layer.size;
    }
  }

  static fromWeights(w: NetworkWeights): Network {
    const n = new Network(w.spec);
    n.weights = w.weights.map(l => l.map(r => [...r]));
    n.biases = w.biases.map(b => [...b]);
    return n;
  }

  toWeights(): NetworkWeights {
    return { spec: this.spec, weights: this.weights.map(l => l.map(r => [...r])), biases: this.biases.map(b => [...b]) };
  }

  /** Forward pass, keeping each layer's pre- and post-activation values so
   *  backward() can use them. */
  private forwardFull(input: number[]): { z: number[][]; a: number[][] } {
    const z: number[][] = [];
    const a: number[][] = [input];
    let cur = input;
    this.spec.layers.forEach((layer, l) => {
      const zl = this.weights[l].map((row, j) => row.reduce((s, w, i) => s + w * cur[i], this.biases[l][j]));
      let al: number[];
      if (layer.activation === 'relu') al = zl.map(relu);
      else if (layer.activation === 'sigmoid') al = zl.map(sigmoid);
      else al = softmax(zl);
      z.push(zl); a.push(al);
      cur = al;
    });
    return { z, a };
  }

  /** The prediction: one probability per output neuron. */
  predict(input: number[]): number[] {
    return this.forwardFull(input).a[this.spec.layers.length];
  }

  /**
   * One training step over a batch. Cross-entropy loss (the standard loss
   * for probabilities), plain gradient descent with a small L2 penalty so
   * no single weight grows large enough to memorise one route.
   * Returns the mean loss over the batch, for the training log.
   */
  trainBatch(inputs: number[][], targets: number[][], learningRate: number, l2 = 1e-4, sampleWeights?: number[]): number {
    const L = this.spec.layers.length;
    const gradW = this.weights.map(l => l.map(r => new Array(r.length).fill(0)));
    const gradB = this.biases.map(b => new Array(b.length).fill(0));
    let totalLoss = 0;

    for (let s = 0; s < inputs.length; s++) {
      const { z, a } = this.forwardFull(inputs[s]);
      const out = a[L];
      const target = targets[s];

      // Loss for the log. Clamp so log(0) cannot appear.
      for (let k = 0; k < out.length; k++) {
        if (target[k] > 0) totalLoss -= target[k] * Math.log(Math.max(out[k], 1e-9));
      }
      const last = this.spec.layers[L - 1].activation;
      if (last === 'sigmoid') {
        for (let k = 0; k < out.length; k++) {
          if (target[k] === 0) totalLoss -= Math.log(Math.max(1 - out[k], 1e-9));
        }
      }

      // For both softmax+cross-entropy and sigmoid+binary-cross-entropy the
      // gradient at the output is simply (output − target). That identity is
      // why those pairings are standard. A per-sample weight scales the whole
      // gradient — this is how a rare class gets a louder vote. (Scaling the
      // TARGET instead breaks the identity and diverges; that was tried.)
      const sw = sampleWeights ? sampleWeights[s] : 1;
      let delta = out.map((o, k) => (o - target[k]) * sw);

      for (let l = L - 1; l >= 0; l--) {
        const prev = a[l];
        for (let j = 0; j < delta.length; j++) {
          gradB[l][j] += delta[j];
          for (let i = 0; i < prev.length; i++) gradW[l][j][i] += delta[j] * prev[i];
        }
        if (l > 0) {
          // Push the error back through the previous layer's activation.
          const nextDelta = new Array(prev.length).fill(0);
          for (let i = 0; i < prev.length; i++) {
            let sum = 0;
            for (let j = 0; j < delta.length; j++) sum += this.weights[l][j][i] * delta[j];
            const act = this.spec.layers[l - 1].activation;
            const g = act === 'relu' ? reluGrad(z[l - 1][i]) : act === 'sigmoid' ? prev[i] * (1 - prev[i]) : 1;
            nextDelta[i] = sum * g;
          }
          delta = nextDelta;
        }
      }
    }

    const n = inputs.length;
    for (let l = 0; l < L; l++) {
      for (let j = 0; j < this.weights[l].length; j++) {
        this.biases[l][j] -= learningRate * (gradB[l][j] / n);
        for (let i = 0; i < this.weights[l][j].length; i++) {
          this.weights[l][j][i] -= learningRate * (gradW[l][j][i] / n + l2 * this.weights[l][j][i]);
        }
      }
    }
    return totalLoss / n;
  }
}

// ---- feature scaling -----------------------------------------------------

/** Per-feature mean and standard deviation from the training set. Inputs are
 *  standardised with these before entering the network — a $2,000 fare and a
 *  0.3 position-in-range must not be compared on raw magnitude. Stored with
 *  the weights so prediction applies exactly the same transform. */
export type Scaler = { mean: number[]; std: number[] };

export function fitScaler(rows: number[][]): Scaler {
  const d = rows[0].length;
  const mean = new Array(d).fill(0);
  const std = new Array(d).fill(0);
  for (const r of rows) for (let i = 0; i < d; i++) mean[i] += r[i] / rows.length;
  for (const r of rows) for (let i = 0; i < d; i++) std[i] += (r[i] - mean[i]) ** 2 / rows.length;
  for (let i = 0; i < d; i++) std[i] = Math.sqrt(std[i]) || 1;
  return { mean, std };
}

export function applyScaler(s: Scaler, row: number[]): number[] {
  return row.map((v, i) => (v - s.mean[i]) / s.std[i]);
}
