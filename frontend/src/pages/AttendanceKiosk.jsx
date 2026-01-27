import React, { useEffect, useRef, useState } from 'react'
import * as faceapi from 'face-api.js'
import jsQR from 'jsqr'
import { markByFace, markByBarcode } from '../api'

export default function AttendanceKiosk(){
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const detectorRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState('Load models to begin')
  const [barcode, setBarcode] = useState('')
  const [scanMode, setScanMode] = useState(false)
  const streamRef = useRef(null)

  useEffect(() => {
    async function init(){
      try {
        setStatus('Loading face models...')
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models')
        ])
        setStatus('Starting camera...')
        const stream = await navigator.mediaDevices.getUserMedia({ video: true })
        streamRef.current = stream
        if (videoRef.current){
          videoRef.current.srcObject = stream
        }
        setReady(true)
        setStatus('Ready. Click "Capture & Mark"')
      } catch (err){
        setStatus('Camera or models failed to load')
      }
    }
    init()

    return () => {
      if (streamRef.current){
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  useEffect(() => {
    if ('BarcodeDetector' in window){
      detectorRef.current = new BarcodeDetector({
        formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e']
      })
    }
  }, [])

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
          if (barcodes.length > 0){
            decoded = barcodes[0].rawValue || ''
          }
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
            setStatus(`Attendance marked for ${data.user.name}`)
            setBarcode('')
            return
          } catch (err){
            setStatus(err.response?.data?.message || 'Barcode failed')
            return
          }
        }
      }
      rafId = requestAnimationFrame(scanLoop)
    }

    if (scanMode){
      setStatus('Scanning barcode...') 
      rafId = requestAnimationFrame(scanLoop)
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [scanMode])

  async function capture(){
    setStatus('Detecting face...')
    const video = videoRef.current
    if (!video) return

    const result = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor()

    if (!result){
      setStatus('No face detected. Try again.')
      return
    }

    const descriptor = Array.from(result.descriptor)
    try {
      const data = await markByFace(descriptor)
      setStatus(`Attendance marked for ${data.user.name}`)
    } catch (err){
      if (err.response?.status === 404){
        setStatus('Face not recognized. Please enroll your face from your student dashboard.')
      } else {
        setStatus(err.response?.data?.message || 'Failed to mark attendance')
      }
    }
  }

  async function submitBarcode(e){
    e.preventDefault()
    setStatus('Submitting barcode...')
    try {
      const data = await markByBarcode(barcode.trim())
      setStatus(`Attendance marked for ${data.user.name}`)
      setBarcode('')
    } catch (err){
      setStatus(err.response?.data?.message || 'Barcode failed')
    }
  }

  return (
    <div className="page">
      <div className="grid">
        <div className="card">
          <h2>Face Attendance</h2>
          <div className="video-box">
            <video ref={videoRef} autoPlay muted playsInline />
            <canvas ref={canvasRef} className="hidden-canvas" />
          </div>
          <button className="btn" disabled={!ready} onClick={capture}>Capture & Mark</button>
          <button className="btn btn--ghost" disabled={!ready || scanMode} onClick={() => setScanMode(true)}>
            {scanMode ? 'Scanning...' : 'Scan Barcode'}
          </button>
          <p className="status">{status}</p>
        </div>

        <div className="card">
          <h2>Barcode Attendance</h2>
          <form onSubmit={submitBarcode} className="form">
            <label>
              Barcode or ID
              <input value={barcode} onChange={(e) => setBarcode(e.target.value)} />
            </label>
            <button className="btn">Submit Barcode</button>
          </form>
        </div>
      </div>

    </div>
  )
}
