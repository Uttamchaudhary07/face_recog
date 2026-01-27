import React, { useEffect, useRef, useState } from 'react'
import * as faceapi from 'face-api.js'
import { enrollFace, getLogs, getMe } from '../api'

export default function StudentDashboard(){
  const [logs, setLogs] = useState([])
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)
  const [enrollStatus, setEnrollStatus] = useState('Load models to enroll your face.')
  const [modelsReady, setModelsReady] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [sampleCount, setSampleCount] = useState(0)
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const TARGET_SAMPLES = 8
  const MAX_ATTEMPTS = 30

  useEffect(() => {
    getLogs().then(setLogs).catch((err) => {
      setError(err.response?.data?.message || 'Failed to load logs')
    })
  }, [])

  useEffect(() => {
    getMe().then(setProfile).catch(() => {})
  }, [])

  useEffect(() => {
    async function init(){
      try {
        setEnrollStatus('Loading face models...')
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models')
        ])
        setEnrollStatus('Starting camera...')
        const stream = await navigator.mediaDevices.getUserMedia({ video: true })
        streamRef.current = stream
        if (videoRef.current){
          videoRef.current.srcObject = stream
        }
        setModelsReady(true)
        setEnrollStatus('Ready to capture face samples.')
      } catch (err){
        setEnrollStatus('Failed to load camera or models.')
      }
    }
    init()

    return () => {
      if (streamRef.current){
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  async function captureSamples(){
    if (!modelsReady || capturing) return
    setCapturing(true)
    setSampleCount(0)
    setEnrollStatus('Capturing samples... look at the camera and hold still.')

    const samples = []
    let attempts = 0

    while (samples.length < TARGET_SAMPLES && attempts < MAX_ATTEMPTS){
      attempts += 1
      const video = videoRef.current
      if (!video || video.readyState < 2){
        await new Promise((r) => setTimeout(r, 300))
        continue
      }

      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptors()

      if (detections.length === 1){
        samples.push(Array.from(detections[0].descriptor))
        setSampleCount(samples.length)
        setEnrollStatus(`Captured ${samples.length}/${TARGET_SAMPLES} samples...`)
      } else if (detections.length > 1){
        setEnrollStatus('Multiple faces detected. Only one person should be in frame.')
      } else {
        setEnrollStatus('No face detected. Adjust lighting and try again.')
      }

      await new Promise((r) => setTimeout(r, 500))
    }

    if (samples.length < TARGET_SAMPLES){
      setEnrollStatus('Not enough valid samples. Please try again.')
      setCapturing(false)
      return
    }

    try {
      await enrollFace(samples)
      setEnrollStatus('Face enrollment complete.')
      setProfile((prev) => (prev ? { ...prev, hasFace: true } : prev))
    } catch (err){
      setEnrollStatus(err.response?.data?.message || 'Face enrollment failed')
    } finally {
      setCapturing(false)
    }
  }

  return (
    <div className="page">
      <div className="card">
        <h2>Student Dashboard</h2>
        {error && <div className="error">{error}</div>}
      </div>

      <div className="card">
        <h3>Face Enrollment</h3>
        <div className="video-box">
          <video ref={videoRef} autoPlay muted playsInline />
        </div>
        <p className="muted">Capture {TARGET_SAMPLES} samples after admin approval. Only one face should be visible.</p>
        {profile?.hasFace && <p className="success">Face enrolled.</p>}
        <button className="btn" disabled={!modelsReady || capturing} onClick={captureSamples}>
          {capturing ? `Capturing ${sampleCount}/${TARGET_SAMPLES}` : 'Enroll Face'}
        </button>
        <p className="status">{enrollStatus}</p>
      </div>

      <div className="card">
        <h3>My Attendance</h3>
        <div className="table">
          <div className="table__row table__head">
            <span>Date</span>
            <span>Time</span>
            <span>Method</span>
          </div>
          {logs.map((log) => (
            <div key={log._id} className="table__row">
              <span>{log.date}</span>
              <span>{log.time}</span>
              <span>{log.method}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
