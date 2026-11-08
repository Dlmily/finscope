export type ForecastCandle = {
  close: number;
  timestamp?: number;
};

export type StockDirectionForecast = {
  horizonTradingDays: number;
  direction: "UP" | "DOWN";
  upProbability: number;
  sampleCount: number;
  walkForward: {
    observations: number;
    accuracy: number;
    majorityBaselineAccuracy: number;
    brierScore: number;
    upRate: number;
  };
};

type Sample = {
  featureIndex: number;
  targetIndex: number;
  features: number[];
  label: number;
};

type LogisticModel = {
  means: number[];
  scales: number[];
  weights: number[];
  bias: number;
};

const LOOKBACK = 60;
const MIN_TRAINING_SAMPLES = 180;
const MAX_VALIDATION_SAMPLES = 60;
const ITERATIONS = 240;
const LEARNING_RATE = 0.08;
const L2 = 0.025;

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  const center = average(values);
  return Math.sqrt(average(values.map(value => (value - center) ** 2)));
}

function sigmoid(value: number) {
  const bounded = Math.max(-30, Math.min(30, value));
  return 1 / (1 + Math.exp(-bounded));
}

function makeFeatures(closes: number[], index: number) {
  const dailyReturns = [];
  for (let cursor = index - 19; cursor <= index; cursor += 1) {
    dailyReturns.push(Math.log(closes[cursor] / closes[cursor - 1]));
  }
  const mean5 = average(closes.slice(index - 4, index + 1));
  const mean20 = average(closes.slice(index - 19, index + 1));
  const mean60 = average(closes.slice(index - 59, index + 1));

  // Only information available at `index` is used. Features are price-only:
  // 1/5/20-bar momentum, short/medium moving-average gaps, and 20-bar volatility.
  return [
    Math.log(closes[index] / closes[index - 1]),
    Math.log(closes[index] / closes[index - 5]),
    Math.log(closes[index] / closes[index - 20]),
    Math.log(mean5 / mean20),
    Math.log(mean20 / mean60),
    standardDeviation(dailyReturns),
  ];
}

function fitLogistic(samples: Sample[]): LogisticModel {
  const width = samples[0].features.length;
  const means = Array.from({ length: width }, (_, feature) =>
    average(samples.map(sample => sample.features[feature]))
  );
  const scales = Array.from({ length: width }, (_, feature) => {
    const scale = standardDeviation(
      samples.map(sample => sample.features[feature])
    );
    return scale > 1e-8 ? scale : 1;
  });
  const labels = samples.map(sample => sample.label);
  const prior = Math.max(0.02, Math.min(0.98, average(labels)));
  const weights = Array.from({ length: width }, () => 0);
  let bias = Math.log(prior / (1 - prior));

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const gradients = Array.from({ length: width }, () => 0);
    let biasGradient = 0;
    for (const sample of samples) {
      let logit = bias;
      for (let feature = 0; feature < width; feature += 1) {
        const normalized =
          (sample.features[feature] - means[feature]) / scales[feature];
        logit += weights[feature] * normalized;
      }
      const error = sigmoid(logit) - sample.label;
      biasGradient += error;
      for (let feature = 0; feature < width; feature += 1) {
        gradients[feature] +=
          error *
          ((sample.features[feature] - means[feature]) / scales[feature]);
      }
    }
    const count = samples.length;
    bias -= LEARNING_RATE * (biasGradient / count);
    for (let feature = 0; feature < width; feature += 1) {
      weights[feature] -=
        LEARNING_RATE * (gradients[feature] / count + L2 * weights[feature]);
    }
  }

  return { means, scales, weights, bias };
}

function predictProbability(model: LogisticModel, features: number[]) {
  let logit = model.bias;
  for (let feature = 0; feature < features.length; feature += 1) {
    logit +=
      model.weights[feature] *
      ((features[feature] - model.means[feature]) / model.scales[feature]);
  }
  return sigmoid(logit);
}

/**
 * Estimates whether the close after `horizonTradingDays` will exceed the latest
 * close. The probability is a model score, not a calibrated or guaranteed odds.
 */
export function predictStockDirection(
  candles: readonly ForecastCandle[],
  horizonTradingDays = 5
): StockDirectionForecast {
  if (
    !Number.isInteger(horizonTradingDays) ||
    horizonTradingDays < 1 ||
    horizonTradingDays > 20
  ) {
    throw new Error("预测周期须为 1 至 20 个交易日。");
  }

  const clean = candles
    .map((candle, order) => ({
      close: candle.close,
      timestamp: candle.timestamp,
      order,
    }))
    .filter(candle => Number.isFinite(candle.close) && candle.close > 0)
    .sort(
      (a, b) =>
        (a.timestamp ?? a.order) - (b.timestamp ?? b.order) || a.order - b.order
    )
    .filter(
      (candle, index, all) =>
        index === 0 ||
        candle.timestamp === undefined ||
        candle.timestamp !== all[index - 1].timestamp
    );
  const closes = clean.map(candle => candle.close);

  const samples: Sample[] = [];
  for (
    let index = LOOKBACK;
    index + horizonTradingDays < closes.length;
    index += 1
  ) {
    samples.push({
      featureIndex: index,
      targetIndex: index + horizonTradingDays,
      features: makeFeatures(closes, index),
      label: closes[index + horizonTradingDays] > closes[index] ? 1 : 0,
    });
  }

  if (samples.length < MIN_TRAINING_SAMPLES + 30 + horizonTradingDays) {
    throw new Error(
      "有效历史不足。该估计至少需要约 300 根有效日线 K 线，请检查供应商权限或数据覆盖。"
    );
  }

  const validationCount = Math.min(
    MAX_VALIDATION_SAMPLES,
    Math.floor(samples.length * 0.2)
  );
  const validationStart = samples.length - validationCount;
  const validation: Array<{
    probability: number;
    label: number;
    baselineProbability: number;
  }> = [];

  for (let index = validationStart; index < samples.length; index += 1) {
    const testSample = samples[index];
    // Embargo overlapping forward labels: a training outcome must be known
    // before this validation day's prediction is formed.
    const training = samples
      .slice(0, index)
      .filter(sample => sample.targetIndex < testSample.featureIndex);
    if (training.length < MIN_TRAINING_SAMPLES) continue;
    const model = fitLogistic(training);
    validation.push({
      probability: predictProbability(model, testSample.features),
      label: testSample.label,
      baselineProbability: average(training.map(sample => sample.label)),
    });
  }

  if (validation.length < 30) {
    throw new Error("可用于时间序列留出验证的样本不足，暂不生成预测。");
  }

  const accuracy = average(
    validation.map(item =>
      Number(item.probability >= 0.5 === (item.label === 1))
    )
  );
  const majorityBaselineAccuracy = average(
    validation.map(item =>
      Number(item.baselineProbability >= 0.5 === (item.label === 1))
    )
  );
  const brierScore = average(
    validation.map(item => (item.probability - item.label) ** 2)
  );
  const upRate = average(samples.map(sample => sample.label));
  const finalModel = fitLogistic(samples);
  const upProbability = predictProbability(
    finalModel,
    makeFeatures(closes, closes.length - 1)
  );

  return {
    horizonTradingDays,
    direction: upProbability >= 0.5 ? "UP" : "DOWN",
    upProbability,
    sampleCount: samples.length,
    walkForward: {
      observations: validation.length,
      accuracy,
      majorityBaselineAccuracy,
      brierScore,
      upRate,
    },
  };
}
