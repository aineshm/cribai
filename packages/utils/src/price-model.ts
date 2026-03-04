export interface PriceModelFeatures {
  readonly bedrooms: number;
  readonly bathrooms: number;
  readonly sqft: number;
  readonly distanceToCampusKm: number;
  readonly amenityCount: number;
  readonly hasParking: boolean;
  readonly hasLaundry: boolean;
  readonly hasAC: boolean;
}

export interface PriceModelCoefficients {
  readonly intercept: number;
  readonly weights: Record<string, number>;
  readonly r2: number;
  readonly sampleSize: number;
}

const FEATURE_KEYS: readonly (keyof PriceModelFeatures)[] = [
  'bedrooms',
  'bathrooms',
  'sqft',
  'distanceToCampusKm',
  'amenityCount',
  'hasParking',
  'hasLaundry',
  'hasAC',
];

function featuresToVector(f: PriceModelFeatures): number[] {
  return FEATURE_KEYS.map((k) => {
    const val = f[k];
    return typeof val === 'boolean' ? (val ? 1 : 0) : (val as number);
  });
}

// Matrix operations for small matrices
function transpose(m: number[][]): number[][] {
  const rows = m.length;
  const cols = m[0]!.length;
  const result: number[][] = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j]![i] = m[i]![j]!;
    }
  }
  return result;
}

function matMul(a: number[][], b: number[][]): number[][] {
  const rows = a.length;
  const cols = b[0]!.length;
  const inner = b.length;
  const result: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      let sum = 0;
      for (let k = 0; k < inner; k++) {
        sum += a[i]![k]! * b[k]![j]!;
      }
      result[i]![j] = sum;
    }
  }
  return result;
}

function invertMatrix(m: number[][]): number[][] | null {
  const n = m.length;
  // Augmented matrix [m | I]
  const aug: number[][] = m.map((row, i) => {
    const augRow = [...row];
    for (let j = 0; j < n; j++) augRow.push(i === j ? 1 : 0);
    return augRow;
  });

  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row]![col]!) > Math.abs(aug[maxRow]![col]!)) {
        maxRow = row;
      }
    }
    [aug[col], aug[maxRow]] = [aug[maxRow]!, aug[col]!];

    const pivot = aug[col]![col]!;
    if (Math.abs(pivot) < 1e-12) return null; // Singular

    for (let j = 0; j < 2 * n; j++) aug[col]![j]! /= pivot;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row]![col]!;
      for (let j = 0; j < 2 * n; j++) {
        aug[row]![j]! -= factor * aug[col]![j]!;
      }
    }
  }

  return aug.map((row) => row.slice(n));
}

function zScoreNormalize(
  data: number[][],
): { normalized: number[][]; means: number[]; stds: number[] } {
  const cols = data[0]!.length;
  const means = new Array(cols).fill(0) as number[];
  const stds = new Array(cols).fill(0) as number[];

  for (let j = 0; j < cols; j++) {
    let sum = 0;
    for (const row of data) sum += row[j]!;
    means[j] = sum / data.length;

    let sqSum = 0;
    for (const row of data) sqSum += (row[j]! - means[j]!) ** 2;
    stds[j] = Math.sqrt(sqSum / data.length);
    if (stds[j]! < 1e-12) stds[j] = 1; // Avoid division by zero
  }

  const normalized = data.map((row) =>
    row.map((val, j) => (val - means[j]!) / stds[j]!),
  );

  return { normalized, means, stds };
}

export function trainPriceModel(
  listings: readonly { features: PriceModelFeatures; rent: number }[],
): PriceModelCoefficients {
  const n = listings.length;
  const rents = listings.map((l) => l.rent);
  const meanRent = rents.reduce((s, r) => s + r, 0) / n;

  // Fallback for small samples
  if (n < 5) {
    return {
      intercept: Math.round(meanRent * 100) / 100,
      weights: {},
      r2: 0,
      sampleSize: n,
    };
  }

  const rawX = listings.map((l) => featuresToVector(l.features));
  const { normalized: normX, means: featureMeans, stds: featureStds } = zScoreNormalize(rawX);

  // Add intercept column (column of 1s)
  const X = normX.map((row) => [1, ...row]);
  const Y = rents.map((r) => [r]);

  // Ridge regression: β = (X'X + λI)^(-1) X'Y
  const lambda = 0.001;
  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  // Add regularization (skip intercept column at index 0)
  for (let i = 1; i < XtX.length; i++) {
    XtX[i]![i]! += lambda;
  }
  const XtXinv = invertMatrix(XtX);

  // If singular, fall back to weighted average
  if (XtXinv === null) {
    return {
      intercept: Math.round(meanRent * 100) / 100,
      weights: {},
      r2: 0,
      sampleSize: n,
    };
  }

  const XtY = matMul(Xt, Y);
  const beta = matMul(XtXinv, XtY);

  // Convert normalized coefficients back to original scale
  const normalizedIntercept = beta[0]![0]!;
  const normalizedWeights = FEATURE_KEYS.map((_, i) => beta[i + 1]![0]!);

  // Original-scale intercept: intercept_orig = β0 - Σ(βi * μi / σi)
  let intercept = normalizedIntercept;
  const weights: Record<string, number> = {};
  for (let i = 0; i < FEATURE_KEYS.length; i++) {
    const origWeight = normalizedWeights[i]! / featureStds[i]!;
    weights[FEATURE_KEYS[i]!] = Math.round(origWeight * 10000) / 10000;
    intercept -= origWeight * featureMeans[i]!;
  }
  intercept = Math.round(intercept * 10000) / 10000;

  // R²
  const ssRes = listings.reduce((sum, l) => {
    const predicted = predictWithOriginal(l.features, intercept, weights);
    return sum + (l.rent - predicted) ** 2;
  }, 0);
  const ssTot = rents.reduce((sum, r) => sum + (r - meanRent) ** 2, 0);
  const r2 = ssTot > 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 0;

  return {
    intercept,
    weights,
    r2: Math.round(r2 * 10000) / 10000,
    sampleSize: n,
  };
}

function predictWithOriginal(
  features: PriceModelFeatures,
  intercept: number,
  weights: Record<string, number>,
): number {
  const vec = featuresToVector(features);
  let prediction = intercept;
  for (let i = 0; i < FEATURE_KEYS.length; i++) {
    prediction += (weights[FEATURE_KEYS[i]!] ?? 0) * vec[i]!;
  }
  return prediction;
}

export function predictRent(
  features: PriceModelFeatures,
  model: PriceModelCoefficients,
): number {
  if (Object.keys(model.weights).length === 0) {
    return model.intercept; // Fallback model
  }
  return Math.round(predictWithOriginal(features, model.intercept, model.weights) * 100) / 100;
}
