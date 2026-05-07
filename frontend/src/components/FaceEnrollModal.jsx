import React, { useEffect, useRef, useState } from 'react'
import * as faceapi from 'face-api.js'
import { enrollStudentFace } from '../api'

// Higher inputSize = better accuracy at the cost of small speed reduction
const DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.6 })
const TARGET_SAMPLES = 12
const MAX_ATTEMPTS = 45
const MIN_FACE_PX = 100

async function getCamera() {
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: 'user' } } })
  } catch {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'user' } } })
    } catch {
      return navigator.mediaDevices.getUserMedia({ video: true })
    }
  }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

export default function FaceEnrollModal({ targetUser, onSuccess, onClose }) {
  const [status, setStatus] = useState('Starting camera...')
  const [statusType, setStatusType] = useState('')  // '' | 'error' | 'success'
  const [capturing, setCapturing] = useState(false)
  const [sampleCount, setSampleCount] = useState(0)
  const [modelsReady, setModelsReady] = useState(false)
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        setStatus('Loading face models...')
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models')
        ])
        if (cancelled) return
        setStatus('Starting camera...')
        const stream = await getCamera()
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        stream.getTracks().forEach(t => {
          t.addEventListener('ended', () => {
            setModelsReady(false)
            setStatus('Camera disconnected. Close and re-open the modal.')
            setStatusType('error')
          })
        })
        setModelsReady(true)
        setStatus(`Ready. Click "Start Enrollment" and have ${targetUser.name} look at the camera.`)
      } catch {
        if (!cancelled) {
          setStatus('Camera or models failed to load. Check browser permissions.')
          setStatusType('error')
        }
      }
    }
    init()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  async function startEnrollment() {
    if (!modelsReady || capturing) return
    setCapturing(true)
    setStatusType('')
    setSampleCount(0)
    setStatus('Capturing — have the student look directly at the camera.')

    const samples = []
    let attempts = 0

    while (samples.length < TARGET_SAMPLES && attempts < MAX_ATTEMPTS) {
      attempts++
      const video = videoRef.current
      if (!video || video.readyState < 2) {
        await delay(300)
        continue
      }

      const detections = await faceapi
        .detectAllFaces(video, DETECTOR_OPTIONS)
        .withFaceLandmarks()
        .withFaceDescriptors()

      if (detections.length === 1) {
        const det = detections[0]
        const { width, height } = det.detection.box
        if (width < MIN_FACE_PX || height < MIN_FACE_PX) {
          setStatus('Move closer to the camera.')
        } else if (det.detection.score < 0.6) {
          setStatus('Low detection confidence. Improve lighting.')
        } else {
          samples.push(Array.from(det.descriptor))
          setSampleCount(samples.length)
          setStatus(`Captured ${samples.length}/${TARGET_SAMPLES} — hold still, almost done...`)
        }
      } else if (detections.length > 1) {
        setStatus('Multiple faces detected. Only the student should be in frame.')
      } else {
        setStatus('No face detected. Adjust position or improve lighting.')
      }

      await delay(400)
    }

    if (samples.length < TARGET_SAMPLES) {
      setStatus(`Only captured ${samples.length}/${TARGET_SAMPLES} samples. Please try again.`)
      setStatusType('error')
      setCapturing(false)
      return
    }

    try {
      setStatus('Uploading enrollment data...')
      await enrollStudentFace(targetUser.id, samples)
      setStatus(`Face enrolled successfully for ${targetUser.name}.`)
      setStatusType('success')
      console.log(`[Enrollment] Success for user: ${targetUser.name} (ID: ${targetUser.id})`)
      setTimeout(() => onSuccess(), 1500)
    } catch (err) {
      const httpStatus = err.response?.status
      const msg = err.response?.data?.message || 'Enrollment failed'
      if (httpStatus === 409) {
        setStatus('Face already enrolled. This face is registered under another account.')
      } else {
        setStatus(msg)
      }
      console.error(`[Enrollment] Failed for ${targetUser.name}:`, msg)
      setStatusType('error')
      setCapturing(false)
    }
  }

  return (
    <div className="modal">
      <div className="modal__backdrop" onClick={onClose} />
      <div className="modal__content">
        <div className="modal__header">
          <h4>Enroll Face — {targetUser.name}</h4>
          <button className="btn btn--ghost btn--icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal__body">
          <div className="stack">
            <div className="video-box">
              <video ref={videoRef} autoPlay muted playsInline className="video--mirror" />
            </div>
            <p className="muted">
              Capture {TARGET_SAMPLES} samples. Ensure only the student's face is visible, lighting is good, and their expression is neutral.
            </p>
            {statusType === 'error' && <div className="error">{status}</div>}
            {statusType === 'success' && <div className="success">{status}</div>}
            {statusType === '' && <p className="status">{status}</p>}
            <div className="modal__actions">
              <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
              <button
                className="btn"
                disabled={!modelsReady || capturing}
                onClick={startEnrollment}
              >
                {capturing ? `Capturing ${sampleCount}/${TARGET_SAMPLES}...` : 'Start Enrollment'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
