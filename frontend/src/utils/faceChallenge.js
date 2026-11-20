import * as faceapi from 'face-api.js'
import { sampleFaceQuality } from './faceQuality.js'

const STEP_TIMEOUT = 20000
const MIN_TURN = 0.18
const CENTER_TOLERANCE = 0.10

function eyeCenter(eye){
  const sum = eye.reduce((center, point) => ({ x: center.x + point.x, y: center.y + point.y }), { x: 0, y: 0 })
  return { x: sum.x / eye.length, y: sum.y / eye.length }
}

function noseOffset(landmarks){
  const left = eyeCenter(landmarks.getLeftEye())
  const right = eyeCenter(landmarks.getRightEye())
  const nose = landmarks.getNose()[3]
  const dx = right.x - left.x
  const dy = right.y - left.y
  // Project onto the eye axis so tilting the head is distinct from turning it.
  return ((nose.x - left.x) * dx + (nose.y - left.y) * dy) / (dx * dx + dy * dy) - 0.5
}

export async function captureLiveFace(video, setStatus, isActive){
  const frame = document.createElement('canvas')
  const context = frame.getContext('2d')
  frame.width = video.videoWidth
  frame.height = video.videoHeight
  if (Math.min(frame.width, frame.height) < 240) return { message: 'Camera resolution is too low. Try another camera or use a barcode.' }
  const qualityFrame = document.createElement('canvas')
  qualityFrame.width = qualityFrame.height = 64
  const detector = new faceapi.TinyFaceDetectorOptions()
  const direction = Math.random() < 0.5 ? -1 : 1
  const side = direction < 0 ? 'left' : 'right'
  let neutralPose

  const steps = [
    { prompt: 'Look straight ahead.', accepts: (pose) => Math.abs(pose) <= MIN_TURN },
    { prompt: `Turn your head slightly toward the ${side} edge of the screen and hold.`, accepts: (pose) => direction * (pose - neutralPose) >= MIN_TURN },
    { prompt: 'Look straight ahead again.', accepts: (pose) => Math.abs(pose - neutralPose) <= CENTER_TOLERANCE }
  ]
  const descriptors = []
  const qualities = []
  let lastFrameTime = -1

  for (const step of steps){
    setStatus(step.prompt)
    const deadline = performance.now() + STEP_TIMEOUT
    let qualityMessage

    while (isActive()){
      // Let the prompt paint and wait for a fresh camera frame.
      await new Promise((resolve) => setTimeout(resolve, 150))
      if (!isActive()) return null
      if (performance.now() >= deadline){
        return { message: qualityMessage || (descriptors.length === 0
          ? 'No centered face detected. Look straight at the camera and try again.'
          : 'The head-turn check timed out. Follow the prompts or use barcode attendance.') }
      }
      if (video.readyState < 2 || video.currentTime === lastFrameTime) continue
      lastFrameTime = video.currentTime
      context.drawImage(video, 0, 0, frame.width, frame.height)

      const faces = await faceapi.detectAllFaces(frame, detector).withFaceLandmarks()
      if (!isActive()) return null
      if (faces.length > 1) return { message: 'Only one person should be in view. Try again.' }
      if (faces.length === 0) continue

      const { landmarks, detection } = faces[0]
      const pose = noseOffset(landmarks)
      if (!Number.isFinite(pose) || !step.accepts(pose)) continue

      const quality = sampleFaceQuality(frame, detection.box, pose, qualityFrame)
      if (quality.message || quality.score < 0.45) {
        qualityMessage = quality.message || 'Improve your lighting and hold still.'
        setStatus(`${qualityMessage} ${step.prompt}`)
        continue
      }

      const [face] = await faceapi.extractFaces(frame, [landmarks.align(null, { useDlibAlignment: true })])
      const descriptor = await faceapi.computeFaceDescriptor(face)
      if (!isActive()) return null
      if (descriptors.length === 0) neutralPose = pose
      descriptors.push(Array.from(descriptor))
      qualities.push(quality.score)
      break
    }
    if (!isActive()) return null
  }

  return { descriptors, qualities }
}
