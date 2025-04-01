import { getLength, offset as sphereOffset } from 'ol/sphere'
import { fromLonLat, toLonLat } from 'ol/proj'
import LineString from 'ol/geom/LineString'
import { unByKey } from 'ol/Observable'
import {
  RADIANS_TO_DEGREES,
  DEGREES_TO_RADIANS,
  METERS_TO_KM,
  METERS_TO_MILES,
} from './constants'

export const calculateAzimuth = (coord1, coord2) => {
  if (
    !coord1 ||
    !coord2 ||
    !Array.isArray(coord1) ||
    !Array.isArray(coord2) ||
    coord1.length < 2 ||
    coord2.length < 2
  )
    return NaN
  const dx = coord2[0] - coord1[0]
  const dy = coord2[1] - coord1[1]
  let azimuth = Math.atan2(dx, dy) * RADIANS_TO_DEGREES
  if (azimuth < 0) azimuth += 360
  return isNaN(azimuth) ? NaN : azimuth
}

export const calculateAngleAtVertex = (coordA, coordB, coordC) => {
  if (!coordA || !coordB || !coordC) return NaN
  const vBAx = coordA[0] - coordB[0]
  const vBAy = coordA[1] - coordB[1]
  const vBCx = coordC[0] - coordB[0]
  const vBCy = coordC[1] - coordB[1]
  const angleBA = Math.atan2(vBAy, vBAx)
  const angleBC = Math.atan2(vBCy, vBCx)
  let angleDiff = angleBC - angleBA
  angleDiff = (angleDiff + 2 * Math.PI) % (2 * Math.PI)
  let angleDeg = angleDiff * RADIANS_TO_DEGREES
  if (angleDeg > 180) {
    angleDeg = 360 - angleDeg
  }
  return angleDeg
}

export const removeInteraction = (map, interactionRef) => {
  if (interactionRef.current && map) {
    try {
      const interactions = map.getInteractions().getArray()
      if (interactions.includes(interactionRef.current)) {
        map.removeInteraction(interactionRef.current)
      }
    } catch (e) {
      /* Ignore */
    } finally {
      interactionRef.current = null
    }
  }
}

export const clearListener = (listenerRef) => {
  if (listenerRef.current) {
    try {
      unByKey(listenerRef.current)
    } catch (e) {
      /* Ignore */
    }
    listenerRef.current = null
  }
}

export const calculateMeasurement = (featureOrGeom) => {
  let geom = null
  let distance = 0
  let azimuth = 0

  if (featureOrGeom) {
    if (typeof featureOrGeom.getGeometry === 'function')
      geom = featureOrGeom.getGeometry()
    else if (typeof featureOrGeom.getCoordinates === 'function')
      geom = featureOrGeom
  }

  if (geom) {
    const coords = geom?.getCoordinates()
    if (
      coords &&
      Array.isArray(coords) &&
      coords.length >= 2 &&
      Array.isArray(coords[0])
    ) {
      const lastPoint = coords[coords.length - 1]
      const secondLastPoint = coords[coords.length - 2]
      if (
        Array.isArray(lastPoint) &&
        Array.isArray(secondLastPoint) &&
        lastPoint.length >= 2 &&
        secondLastPoint.length >= 2
      ) {
        const segmentGeom = new LineString([secondLastPoint, lastPoint])
        const dist = getLength(segmentGeom)
        const az = calculateAzimuth(secondLastPoint, lastPoint)
        distance = isNaN(dist) ? 0 : dist
        azimuth = isNaN(az) ? 0 : az
      }
    }
  }
  return { distance, azimuth }
}

export const formatDistance = (distance, unit) => {
  if (isNaN(distance) || distance === null) return 'N/A'
  if (unit === 'km') return `${(distance * METERS_TO_KM).toFixed(2)} km`
  return `${(distance * METERS_TO_MILES).toFixed(2)} mi`
}

export const formatAzimuth = (azimuth, unit) => {
  if (isNaN(azimuth) || azimuth === null) return 'N/A'
  if (unit === 'deg') return `${azimuth.toFixed(2)}°`
  return `${(azimuth * DEGREES_TO_RADIANS).toFixed(4)} rad`
}

export const formatHoverAngle = (angle, unit) => {
  if (angle === null || isNaN(angle)) return 'N/A'
  if (unit === 'deg') return `${angle.toFixed(1)}°`
  return `${(angle * DEGREES_TO_RADIANS).toFixed(4)} rad`
}

export const calculateOffsetCoord = (
  startCoord,
  distance,
  angle,
  distanceUnit,
  angleUnit
) => {
  const distValue = parseFloat(distance)
  const angleValue = parseFloat(angle)
  if (isNaN(distValue) || isNaN(angleValue) || distValue <= 0) return null

  const distanceMeters =
    distanceUnit === 'km'
      ? distValue / METERS_TO_KM
      : distValue / METERS_TO_MILES
  let azimuthDegrees =
    angleUnit === 'deg' ? angleValue : angleValue * RADIANS_TO_DEGREES
  azimuthDegrees = ((azimuthDegrees % 360) + 360) % 360
  const bearingRadians = azimuthDegrees * DEGREES_TO_RADIANS
  const startPointLonLat = toLonLat(startCoord)

  try {
    const newEndPointLonLat = sphereOffset(
      startPointLonLat,
      distanceMeters,
      bearingRadians
    )
    return fromLonLat(newEndPointLonLat)
  } catch (error) {
    console.error('Error calculating offset:', error)
    return null
  }
}
