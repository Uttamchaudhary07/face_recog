import React from 'react'

export default function StudentFields({ values, onChange }) {
  return (
    <>
      <label>
        Department
        <input value={values.department ?? ''} onChange={(e) => onChange('department', e.target.value)} required maxLength={100} />
      </label>
      <label>
        Semester
        <input type="number" min="1" max="255" step="1" value={values.semester ?? ''} onChange={(e) => onChange('semester', e.target.value)} required />
      </label>
      <label>
        Section (optional)
        <input value={values.section ?? ''} onChange={(e) => onChange('section', e.target.value)} maxLength={30} />
      </label>
    </>
  )
}
