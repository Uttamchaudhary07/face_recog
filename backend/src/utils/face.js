export function validateDescriptor(d) {
  return Array.isArray(d) && d.length === 128 && d.every(v => typeof v === 'number' && isFinite(v))
}

export function euclideanDistance(a, b) {
  if (!validateDescriptor(a) || !validateDescriptor(b)) return Number.POSITIVE_INFINITY
  let sum = 0
  for (let i = 0; i < 128; i++) {
    const diff = a[i] - b[i]
    sum += diff * diff
  }
  return Math.sqrt(sum)
}

export function averageDescriptors(descriptors) {
  if (!Array.isArray(descriptors) || descriptors.length === 0) return null
  const valid = descriptors.filter(validateDescriptor)
  if (valid.length < 3) return null

  // Naive mean (first pass)
  const mean = new Array(128).fill(0)
  for (const d of valid) {
    for (let i = 0; i < 128; i++) mean[i] += d[i]
  }
  for (let i = 0; i < 128; i++) mean[i] /= valid.length

  // Remove outliers: keep samples within mean + 1 standard deviation of distance from mean
  const distances = valid.map(d => euclideanDistance(d, mean))
  const avgDist = distances.reduce((s, v) => s + v, 0) / distances.length
  const stdDev = Math.sqrt(
    distances.reduce((s, v) => s + (v - avgDist) ** 2, 0) / distances.length
  )
  const filtered = valid.filter((_, i) => distances[i] <= avgDist + stdDev)
  const pool = filtered.length >= 3 ? filtered : valid

  // Recompute mean with filtered pool
  const result = new Array(128).fill(0)
  for (const d of pool) {
    for (let i = 0; i < 128; i++) result[i] += d[i]
  }
  for (let i = 0; i < 128; i++) result[i] /= pool.length
  return result
}
