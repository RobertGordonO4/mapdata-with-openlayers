import { useState, useCallback } from 'react'
import {
  calculateMeasurement,
  formatDistance,
  formatAzimuth,
  formatHoverAngle,
} from '../mapUtils'
import { METERS_TO_KM, METERS_TO_MILES, DEGREES_TO_RADIANS } from '../constants'

const useMeasurementDisplay = () => {
  const [measurement, setMeasurement] = useState({ distance: 0, azimuth: 0 })
  const [distanceUnit, setDistanceUnit] = useState('km')
  const [angleUnit, setAngleUnit] = useState('deg')
  const [hoveredAngle, setHoveredAngle] = useState(null)
  const [hoveredAngleUnit, setHoveredAngleUnit] = useState('deg')
  const [inputDistance, setInputDistance] = useState('')
  const [inputAngle, setInputAngle] = useState('')

  const updateMeasurement = useCallback(
    (featureOrGeom, isSegment = true) => {
      const { distance, azimuth } = calculateMeasurement(featureOrGeom)
      setMeasurement({ distance, azimuth })

      if (isSegment) {
        setInputDistance(
          distance > 0
            ? (
                distance *
                (distanceUnit === 'km' ? METERS_TO_KM : METERS_TO_MILES)
              ).toFixed(2)
            : ''
        )
        setInputAngle(
          azimuth !== null
            ? (
                azimuth * (angleUnit === 'deg' ? 1 : DEGREES_TO_RADIANS)
              ).toFixed(angleUnit === 'deg' ? 2 : 4)
            : ''
        )
      } else {
        // Clear inputs if updating for whole feature (e.g., on select)
        setInputDistance('')
        setInputAngle('')
      }
    },
    [distanceUnit, angleUnit]
  ) // Dependencies

  const clearInputs = useCallback(() => {
    setInputDistance('')
    setInputAngle('')
  }, [])

  const toggleDistanceUnit = useCallback(
    () => setDistanceUnit((prev) => (prev === 'km' ? 'mi' : 'km')),
    []
  )
  const toggleAngleUnit = useCallback(
    () => setAngleUnit((prev) => (prev === 'deg' ? 'rad' : 'deg')),
    []
  )
  const toggleHoveredAngleUnit = useCallback(
    () => setHoveredAngleUnit((prev) => (prev === 'deg' ? 'rad' : 'deg')),
    []
  )

  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target
    if (name === 'distance') setInputDistance(value)
    else if (name === 'angle') setInputAngle(value)
  }, [])

  return {
    measurement,
    distanceUnit,
    angleUnit,
    hoveredAngle,
    hoveredAngleUnit,
    inputDistance,
    inputAngle,
    setHoveredAngle, // Expose setter for hover effect hook
    updateMeasurement,
    clearInputs, // Expose clear function
    displayDistance: formatDistance(measurement.distance, distanceUnit),
    displayAzimuth: formatAzimuth(measurement.azimuth, angleUnit),
    displayHoveredAngle: formatHoverAngle(hoveredAngle, hoveredAngleUnit),
    toggleDistanceUnit,
    toggleAngleUnit,
    toggleHoveredAngleUnit,
    handleInputChange,
  }
}

export default useMeasurementDisplay
