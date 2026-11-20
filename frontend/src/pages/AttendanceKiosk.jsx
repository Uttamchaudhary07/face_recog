import React, { useEffect, useRef, useState } from 'react'
import * as faceapi from 'face-api.js'
import jsQR from 'jsqr'
import { captureLiveFace } from '../utils/faceChallenge.js'
import { markByFace, markByBarcode } from '../api'

// Higher inputSize improves detection under varied angles and lighting

// Number of frames captured and averaged before sending to backend.
// Averaging reduces per-frame noise and improves matching accuracy.

export default function AttendanceKiosk({ user }){
  const canMark = !import.meta.env.PROD || ['admin', 'teacher'].includes(user?.role)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const detectorRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState('Loading models and camera...')
  const [barcode, setBarcode] = useState('')
  const [scanMode, setScanMode] = useState(false)
  const [capturing, setCapturing] = useState(false)
  // Cooldown prevents rapid re-submission after a successful or already-marked response
  const [cooldown, setCooldown] = useState(false)

  async function startFrontCamera() {
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

  useEffect(() => {
    let cancelled = false
    async function init(){
      try {
        setStatus('Loading face models...')
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models')
        ])
        if (cancelled) return
        setStatus('Starting camera...')
        const stream = await startFrontCamera()
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        stream.getTracks().forEach(track => {
          track.addEventListener('ended', () => {
            setReady(false)
            setStatus('Camera disconnected. Please reload the page.')
          })
        })
        setReady(true)
        setStatus('Ready. Click "Capture & Mark Attendance"')
      } catch {
        if (!cancelled) setStatus('Camera or models failed to load. Check browser permissions.')
      }
    }
    init()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  useEffect(() => {
    if ('BarcodeDetector' in window){
      detectorRef.current = new BarcodeDetector({
        formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e']
      })
    }
  }, [])

  // Barcode scan loop
  useEffect(() => {
    let rafId
    async function scanLoop(){
      if (!scanMode) return
      const video = videoRef.current
      const canvas = canvasRef.current
      if (video && canvas && video.readyState >= 2){
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        let decoded = ''
        if (detectorRef.current){
          const barcodes = await detectorRef.current.detect(canvas)
          if (barcodes.length > 0) decoded = barcodes[0].rawValue || ''
        }
        if (!decoded){
          const code = jsQR(imageData.data, imageData.width, imageData.height)
          decoded = code?.data || ''
        }
        if (decoded){
          setScanMode(false)
          setStatus('Barcode detected. Marking attendance...')
          try {
            const data = await markByBarcode(decoded.trim())
            if (data.status === 'already_marked') {
              setStatus(`Already marked today for ${data.user.name}`)
            } else {
              setStatus(`Attendance marked for ${data.user.name}`)
            }
          } catch (err){
            setStatus(err.response?.data?.message || 'Barcode not recognized')
          }
          return
        }
      }
      rafId = requestAnimationFrame(scanLoop)
    }
    if (scanMode){
      setStatus('Scanning barcode — point camera at the code...')
      rafId = requestAnimationFrame(scanLoop)
    }
    return () => { if (rafId) cancelAnimationFrame(rafId) }
  }, [scanMode])

  async function capture(){
    const video = videoRef.current
    if (!canMark || capturing || scanMode || cooldown || !ready) return
    if (!video || video.readyState < 2){
      setStatus('Camera is still starting. Try again in a moment.')
      return
    }

    setCapturing(true)
    try {
      const result = await captureLiveFace(video, setStatus, () => videoRef.current === video)
      if (!result) return
      if (result.message){
        setStatus(result.message)
        return
      }

      setStatus('Head-turn check complete. Checking attendance...')
      const data = await markByFace(result.descriptors, result.qualities)
      setStatus(data.status === 'already_marked'
        ? `Attendance already marked today for ${data.user.name}`
        : `Attendance marked for ${data.user.name}`)
      setCooldown(true)
      setTimeout(() => setCooldown(false), 5000)
    } catch (err){
      if (err.response?.status === 404){
        setStatus('Face could not be matched confidently. Try again or use barcode attendance.')
      } else {
        setStatus(err.response?.data?.message || 'Could not complete the face check. Try again.')
      }
    } finally {
      setCapturing(false)
    }
  }

  async function submitBarcode(e){
    e.preventDefault()
    if (!canMark) return
    if (!barcode.trim() || cooldown) return
    setStatus('Submitting...')
    try {
      const data = await markByBarcode(barcode.trim())
      if (data.status === 'already_marked') {
        setStatus(`Attendance already marked for today — ${data.user.name}`)
      } else {
        setStatus(`Attendance marked for ${data.user.name}`)
      }
      setBarcode('')
      setCooldown(true)
      setTimeout(() => setCooldown(false), 5000)
    } catch (err){
      setStatus(err.response?.data?.message || 'Barcode not recognized')
    }
  }

  return (
    <div className="page">
      <div className="grid">
        <div className="card">
          <h2>Face Attendance</h2>
          {!canMark && <p>Sign in as a teacher or admin to mark attendance.</p>}
          <div className="video-box">
            <video ref={videoRef} autoPlay muted playsInline className="video--mirror" />
            <canvas ref={canvasRef} className="hidden-canvas" />
          </div>
          <button
            className="btn"
            disabled={!canMark || !ready || capturing || scanMode || cooldown}
            onClick={capture}
          >
            {capturing ? 'Detecting...' : cooldown ? 'Please wait...' : 'Capture & Mark Attendance'}
          </button>
          <button
            className="btn btn--ghost"
            disabled={!canMark || !ready || capturing || scanMode}
            onClick={() => setScanMode(true)}
            style={{ marginTop: '0.5rem' }}
          >
            {scanMode ? 'Scanning...' : 'Scan Barcode'}
          </button>
          {scanMode && (
            <button
              className="btn btn--ghost"
              onClick={() => setScanMode(false)}
              style={{ marginTop: '0.5rem' }}
            >
              Cancel Scan
            </button>
          )}
          <p className="status">{status}</p>
        </div>

        <div className="card">
          <h2>Barcode Attendance</h2>
          <form onSubmit={submitBarcode} className="form">
            <label>
              Barcode or User ID
              <input
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                placeholder="Scan or type your ID"
              />
            </label>
            <button className="btn">Submit</button>
          </form>
        </div>
      </div>
    </div>
  )
}
