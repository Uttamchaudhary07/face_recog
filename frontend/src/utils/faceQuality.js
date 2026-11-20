function clamp(value) {
  return Math.max(0, Math.min(1, value))
}

export function measureFaceQuality(pixels, width, pose) {
  const luminance = new Float32Array(pixels.length / 4)
  let dark = 0
  let bright = 0
  for (let i = 0; i < luminance.length; i++) {
    const offset = i * 4
    const value = 0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2]
    luminance[i] = value
    if (value < 32) dark++
    if (value > 236) bright++
  }
  dark /= luminance.length
  bright /= luminance.length
  if (dark > 0.55) return { message: 'Move into better light and try again.' }
  if (bright > 0.55) return { message: 'Move away from the glare and try again.' }

  let edges = 0
  let count = 0
  for (let i = width; i < luminance.length - width; i++) {
    if (i % width === 0 || i % width === width - 1) continue
    edges += Math.abs(4 * luminance[i] - luminance[i - 1] - luminance[i + 1] - luminance[i - width] - luminance[i + width])
    count++
  }
  const sharpness = edges / count
  if (sharpness < 4) return { message: 'The camera image is blurry. Hold still and check the lens.' }
  if (Math.abs(pose) > 0.5) return { message: 'Turn your head less and hold still.' }

  const light = 1 - clamp((dark + bright - 0.08) / 0.7)
  const focus = 0.45 + 0.55 * clamp((sharpness - 4) / 14)
  const angle = 1 - 0.45 * clamp(Math.abs(pose) / 0.5)
  return { score: Math.min(light, focus, angle) }
}

export function sampleFaceQuality(frame, box, pose, sample) {
  if (box.width < 90 || box.height < 90) return { message: 'Move closer so your face is clear in the camera.' }
  const size = sample.width
  const context = sample.getContext('2d', { willReadFrequently: true })
  context.drawImage(frame, box.x, box.y, box.width, box.height, 0, 0, size, size)
  return measureFaceQuality(context.getImageData(0, 0, size, size).data, size, pose)
}
