export function euclideanDistance(a, b){
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return Number.POSITIVE_INFINITY
  let sum = 0
  for (let i = 0; i < a.length; i += 1){
    const diff = a[i] - b[i]
    sum += diff * diff
  }
  return Math.sqrt(sum)
}

export function averageDescriptors(descriptors){
  if (!Array.isArray(descriptors) || descriptors.length === 0) return null
  const length = descriptors[0].length
  if (!length) return null
  const avg = new Array(length).fill(0)
  for (const descriptor of descriptors){
    if (!Array.isArray(descriptor) || descriptor.length !== length) return null
    for (let i = 0; i < length; i += 1){
      avg[i] += descriptor[i]
    }
  }
  for (let i = 0; i < length; i += 1){
    avg[i] /= descriptors.length
  }
  return avg
}
