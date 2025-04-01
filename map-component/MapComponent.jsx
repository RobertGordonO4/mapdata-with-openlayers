import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Map, View } from 'ol'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Draw from 'ol/interaction/Draw'
import Select from 'ol/interaction/Select'
import Modify from 'ol/interaction/Modify'
import { defaults as defaultInteractions } from 'ol/interaction'
import { getLength, offset as sphereOffset } from 'ol/sphere'
import { fromLonLat, toLonLat } from 'ol/proj'
import { Style, Stroke, Circle as CircleStyle, Fill } from 'ol/style'
import LineString from 'ol/geom/LineString'
import { unByKey } from 'ol/Observable'
import { never } from 'ol/events/condition'

const METERS_TO_KM = 0.001
const METERS_TO_MILES = 0.000621371
const DEGREES_TO_RADIANS = Math.PI / 180
const RADIANS_TO_DEGREES = 180 / Math.PI
const PIXEL_TOLERANCE_SQ = 6 * 6 // Squared pixel tolerance for hover detection

const MapComponent = () => {
  // --- Core Refs ---
  const mapRef = useRef(null)
  const vectorSourceRef = useRef(new VectorSource())
  const mapInstanceRef = useRef(null)
  const mainVectorLayerRef = useRef(null)

  // --- State ---
  const [measurement, setMeasurement] = useState({ distance: 0, azimuth: 0 })
  const [distanceUnit, setDistanceUnit] = useState('km')
  const [angleUnit, setAngleUnit] = useState('deg')
  const [hoveredAngle, setHoveredAngle] = useState(null)
  const [hoveredAngleUnit, setHoveredAngleUnit] = useState('deg')
  const [inputDistance, setInputDistance] = useState('')
  const [inputAngle, setInputAngle] = useState('')
  const [isDrawing, setIsDrawing] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isAppending, setIsAppending] = useState(false)
  const [activeFeature, setActiveFeature] = useState(null)
  const [featuresCount, setFeaturesCount] = useState(0)

  // --- Interaction & State Refs ---
  const activeFeatureRef = useRef(null)
  const backupCoordsRef = useRef(null)
  const drawInteractionRef = useRef(null)
  const selectInteractionRef = useRef(null)
  const modifyInteractionRef = useRef(null)
  const sketchListenerRef = useRef(null)
  const appendLayerRef = useRef(null)
  const appendSourceRef = useRef(null)
  const appendSketchFeatureRef = useRef(null)
  const isAppendingRef = useRef(false)
  const isEditingRef = useRef(isEditing)
  const pointerMoveListenerKey = useRef(null) // Ref for the pointermove listener key

  // --- Styles ---
  const finalizedStyle = new Style({
    stroke: new Stroke({ color: 'rgba(0, 0, 255, 1)', width: 3 }),
    image: new CircleStyle({
      radius: 4,
      fill: new Fill({ color: 'rgba(0, 0, 255, 1)' }),
    }),
  })
  const drawingStyle = new Style({
    stroke: new Stroke({
      color: 'rgba(0, 150, 255, 0.7)',
      width: 3,
      lineDash: [5, 5],
    }),
    image: new CircleStyle({
      radius: 5,
      fill: new Fill({ color: 'rgba(0, 150, 255, 0.7)' }),
    }),
  })
  const selectedStyle = new Style({
    stroke: new Stroke({ color: 'rgba(255, 0, 0, 0.8)', width: 4 }),
    image: new CircleStyle({
      radius: 6,
      fill: new Fill({ color: 'rgba(255, 0, 0, 0.8)' }),
    }),
  })
  const modifyVertexStyle = new Style({
    image: new CircleStyle({
      radius: 6,
      fill: new Fill({ color: 'orange' }),
      stroke: new Stroke({ color: 'white', width: 2 }),
    }),
  })

  // --- Style Function for Main Layer ---
  const layerStyleFunction = useCallback((feature) => {
    if (isEditingRef.current && feature === activeFeatureRef.current) {
      return selectedStyle
    }
    if (isAppendingRef.current && feature === activeFeatureRef.current) {
      return selectedStyle
    }
    return finalizedStyle
  }, [])

  // --- Display Logic ---
  const displayDistance = () => {
    const distMeters = measurement.distance
    if (isNaN(distMeters) || distMeters === null) return 'N/A'
    if (distanceUnit === 'km')
      return `${(distMeters * METERS_TO_KM).toFixed(2)} km`
    return `${(distMeters * METERS_TO_MILES).toFixed(2)} mi`
  }
  const displayAzimuth = () => {
    const azDegrees = measurement.azimuth
    if (isNaN(azDegrees) || azDegrees === null) return 'N/A'
    if (angleUnit === 'deg') return `${azDegrees.toFixed(2)}°`
    return `${(azDegrees * DEGREES_TO_RADIANS).toFixed(4)} rad`
  }
  // --- Display Logic for Hovered Angle ---
  const displayHoveredAngle = () => {
    if (hoveredAngle === null || isNaN(hoveredAngle)) return 'N/A'
    // Use the new state to format
    if (hoveredAngleUnit === 'deg') {
      return `${hoveredAngle.toFixed(1)}°`
    } else {
      return `${(hoveredAngle * DEGREES_TO_RADIANS).toFixed(4)} rad`
    }
  }

  // --- Unit Toggles ---
  const toggleDistanceUnit = () =>
    setDistanceUnit((prev) => (prev === 'km' ? 'mi' : 'km'))
  const toggleAngleUnit = () =>
    setAngleUnit((prev) => (prev === 'deg' ? 'rad' : 'deg'))
  const toggleHoveredAngleUnit = () =>
    setHoveredAngleUnit((prev) => (prev === 'deg' ? 'rad' : 'deg'))

  // --- Input Handling ---
  const handleInputChange = (e) => {
    const { name, value } = e.target
    if (name === 'distance') setInputDistance(value)
    else if (name === 'angle') setInputAngle(value)
  }

  // --- Geometry Helpers ---
  const calculateAzimuth = useCallback((coord1, coord2) => {
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
  }, [])

  // Calculates the angle (in degrees, 0-360) at vertex B for segment AB-BC
  const calculateAngleAtVertex = useCallback((coordA, coordB, coordC) => {
    if (!coordA || !coordB || !coordC) return NaN
    const vBAx = coordA[0] - coordB[0]
    const vBAy = coordA[1] - coordB[1]
    const vBCx = coordC[0] - coordB[0]
    const vBCy = coordC[1] - coordB[1]

    const angleBA = Math.atan2(vBAy, vBAx) // Angle of vector BA
    const angleBC = Math.atan2(vBCy, vBCx) // Angle of vector BC

    let angleDiff = angleBC - angleBA // Angle from BA to BC

    // Normalize to 0 - 2*PI
    angleDiff = (angleDiff + 2 * Math.PI) % (2 * Math.PI)

    // Convert to degrees
    let angleDeg = angleDiff * RADIANS_TO_DEGREES

    // Often we want the interior angle of the turn, which might be 360 - angleDeg
    // Let's return the smaller angle for simplicity of display
    if (angleDeg > 180) {
      angleDeg = 360 - angleDeg
    }

    return angleDeg
  }, [])

  // --- Interaction & Listener Management ---
  const removeInteraction = useCallback((interactionRef) => {
    if (interactionRef.current && mapInstanceRef.current) {
      try {
        const interactions = mapInstanceRef.current.getInteractions().getArray()
        if (interactions.includes(interactionRef.current)) {
          mapInstanceRef.current.removeInteraction(interactionRef.current)
        }
      } catch (e) {
        /* Ignore */
      } finally {
        interactionRef.current = null
      }
    }
  }, [])

  const clearSketchListener = useCallback(() => {
    if (sketchListenerRef.current) {
      unByKey(sketchListenerRef.current)
      sketchListenerRef.current = null
    }
  }, [])

  // --- Measurement Update Helper ---
  const updateMeasurementDisplay = useCallback(
    (featureOrGeom, isSegment = true) => {
      let geom = null
      if (!featureOrGeom) {
        setMeasurement({ distance: 0, azimuth: 0 })
        if (isSegment) {
          setInputDistance('')
          setInputAngle('')
        }
        return
      }
      if (typeof featureOrGeom.getGeometry === 'function')
        geom = featureOrGeom.getGeometry()
      else if (typeof featureOrGeom.getCoordinates === 'function')
        geom = featureOrGeom
      else {
        setMeasurement({ distance: 0, azimuth: 0 })
        if (isSegment) {
          setInputDistance('')
          setInputAngle('')
        }
        return
      }

      const coords = geom?.getCoordinates()
      if (
        !coords ||
        !Array.isArray(coords) ||
        coords.length < 2 ||
        !Array.isArray(coords[0])
      ) {
        setMeasurement({ distance: 0, azimuth: 0 })
        if (isSegment) {
          setInputDistance('')
          setInputAngle('')
        }
        return
      }
      const lastPoint = coords[coords.length - 1]
      const secondLastPoint = coords[coords.length - 2]
      if (
        !Array.isArray(lastPoint) ||
        !Array.isArray(secondLastPoint) ||
        lastPoint.length < 2 ||
        secondLastPoint.length < 2
      ) {
        setMeasurement({ distance: 0, azimuth: 0 })
        if (isSegment) {
          setInputDistance('')
          setInputAngle('')
        }
        return
      }
      const segmentGeom = new LineString([secondLastPoint, lastPoint])
      const distance = getLength(segmentGeom)
      const azimuth = calculateAzimuth(secondLastPoint, lastPoint)
      const validDistance = isNaN(distance) ? 0 : distance
      const validAzimuth = isNaN(azimuth) ? 0 : azimuth

      setMeasurement({ distance: validDistance, azimuth: validAzimuth })

      if (isSegment) {
        setInputDistance(
          (
            validDistance *
            (distanceUnit === 'km' ? METERS_TO_KM : METERS_TO_MILES)
          ).toFixed(2)
        )
        setInputAngle(
          (
            validAzimuth * (angleUnit === 'deg' ? 1 : DEGREES_TO_RADIANS)
          ).toFixed(angleUnit === 'deg' ? 2 : 4)
        )
      }
    },
    [distanceUnit, angleUnit, calculateAzimuth]
  )

  // --- Append Mode Callbacks ---
  const cleanupAppend = useCallback(() => {
    const map = mapInstanceRef.current
    if (!map) return

    if (appendLayerRef.current) map.removeLayer(appendLayerRef.current)
    if (appendSourceRef.current) appendSourceRef.current.clear()
    removeInteraction(drawInteractionRef) // Remove append draw interaction

    appendLayerRef.current = null
    appendSourceRef.current = null
    appendSketchFeatureRef.current = null
    backupCoordsRef.current = null
    clearSketchListener()

    if (isEditingRef.current && selectInteractionRef.current) {
      try {
        if (
          map
            .getInteractions()
            .getArray()
            .includes(selectInteractionRef.current)
        ) {
          selectInteractionRef.current.setActive(true)
        } else {
          selectInteractionRef.current = null
        }
      } catch (e) {
        /* Ignore */
      }
    }
    setIsAppending(false)
  }, [removeInteraction, clearSketchListener])

  const cancelAppend = useCallback(() => {
    if (activeFeatureRef.current)
      updateMeasurementDisplay(activeFeatureRef.current)
    else updateMeasurementDisplay(null)
    cleanupAppend()
  }, [cleanupAppend, updateMeasurementDisplay])

  const confirmAppend = useCallback(() => {
    const currentActiveFeature = activeFeatureRef.current
    if (
      !isAppendingRef.current ||
      !currentActiveFeature ||
      !backupCoordsRef.current ||
      !appendSketchFeatureRef.current
    ) {
      cleanupAppend()
      return
    }
    const sketchGeom = appendSketchFeatureRef.current.getGeometry()
    const sketchCoords = sketchGeom?.getCoordinates()
    if (
      !sketchCoords ||
      !Array.isArray(sketchCoords) ||
      !Array.isArray(backupCoordsRef.current) ||
      sketchCoords.length <= backupCoordsRef.current.length
    ) {
      cancelAppend()
      return
    }
    const newPoints = sketchCoords.slice(backupCoordsRef.current.length)
    const finalCoords = backupCoordsRef.current.concat(newPoints)
    try {
      currentActiveFeature.getGeometry().setCoordinates(finalCoords)
      updateMeasurementDisplay(currentActiveFeature)
    } catch (e) {
      cancelAppend()
      return
    }
    if (selectInteractionRef.current)
      try {
        selectInteractionRef.current.getFeatures().clear()
      } catch (e) {
        /* Ignore */
      }
    setActiveFeature(null)
    cleanupAppend()
  }, [cancelAppend, updateMeasurementDisplay, cleanupAppend])

  const startAppend = useCallback(() => {
    const map = mapInstanceRef.current
    const currentActiveFeature = activeFeatureRef.current
    if (
      !map ||
      !currentActiveFeature ||
      isDrawing ||
      isAppendingRef.current ||
      !isEditingRef.current
    )
      return
    const geom = currentActiveFeature.getGeometry()
    const coords = geom?.getCoordinates()
    if (
      !coords ||
      !Array.isArray(coords) ||
      coords.length === 0 ||
      !Array.isArray(coords[0])
    )
      return
    if (selectInteractionRef.current)
      try {
        if (
          map
            .getInteractions()
            .getArray()
            .includes(selectInteractionRef.current)
        )
          selectInteractionRef.current.setActive(false)
        else selectInteractionRef.current = null
      } catch (e) {
        /* Ignore */
      }
    backupCoordsRef.current = JSON.parse(JSON.stringify(coords))
    const startCoord = coords[coords.length - 1]
    setIsAppending(true)
    removeInteraction(drawInteractionRef)
    clearSketchListener()
    if (appendLayerRef.current) map.removeLayer(appendLayerRef.current)
    if (appendSourceRef.current) appendSourceRef.current.clear()
    appendSourceRef.current = new VectorSource()
    appendLayerRef.current = new VectorLayer({
      source: appendSourceRef.current,
      style: drawingStyle,
      zIndex: 10,
    })
    map.addLayer(appendLayerRef.current)
    const geometryFunction = (drawCoords, geometry) => {
      if (
        !isAppendingRef.current ||
        !backupCoordsRef.current ||
        !Array.isArray(backupCoordsRef.current)
      ) {
        return geometry ? geometry.setCoordinates([]) : new LineString([])
      }
      const currentSketchPoints = drawCoords
      const newPoints =
        currentSketchPoints.length > 1 ? currentSketchPoints.slice(1) : []
      const combinedCoords = backupCoordsRef.current.concat(newPoints)
      if (!geometry) geometry = new LineString(combinedCoords)
      else geometry.setCoordinates(combinedCoords)
      if (geometry.getCoordinates().length > backupCoordsRef.current.length)
        updateMeasurementDisplay(geometry, true)
      else if (
        geometry.getCoordinates().length === backupCoordsRef.current.length &&
        backupCoordsRef.current.length > 1
      )
        updateMeasurementDisplay(
          new LineString(backupCoordsRef.current.slice(-2)),
          true
        )
      else updateMeasurementDisplay(null, true)
      return geometry
    }
    const drawInteraction = new Draw({
      source: appendSourceRef.current,
      type: 'LineString',
      style: drawingStyle,
      geometryFunction: geometryFunction,
      condition: (e) => e.originalEvent.pointerType !== 'touch',
      freehandCondition: never,
    })
    drawInteractionRef.current = drawInteraction
    map.addInteraction(drawInteraction)
    drawInteraction.on('drawstart', (evt) => {
      if (!isAppendingRef.current) return
      appendSketchFeatureRef.current = evt.feature
      clearSketchListener()
    })
    drawInteraction.on('drawend', (evt) => {
      clearSketchListener()
      if (isAppendingRef.current && evt.feature) {
        appendSketchFeatureRef.current = evt.feature
        confirmAppend()
      } else if (isAppendingRef.current) {
        cancelAppend()
      }
    })
    requestAnimationFrame(() => {
      if (
        !isAppendingRef.current ||
        !mapInstanceRef.current ||
        !drawInteractionRef.current ||
        !backupCoordsRef.current ||
        !Array.isArray(startCoord) ||
        startCoord.length < 2
      )
        return
      try {
        const pixel = mapInstanceRef.current.getPixelFromCoordinate(startCoord)
        if (!pixel || !Array.isArray(pixel) || pixel.length < 2) return
        if (drawInteractionRef.current?.handleEvent) {
          const fakeDown = {
            type: 'pointerdown',
            coordinate: startCoord,
            pixel: pixel,
            originalEvent: new PointerEvent('pointerdown', {
              clientX: pixel[0],
              clientY: pixel[1],
            }),
            map: mapInstanceRef.current,
          }
          const fakeUp = {
            type: 'pointerup',
            coordinate: startCoord,
            pixel: pixel,
            originalEvent: new PointerEvent('pointerup', {
              clientX: pixel[0],
              clientY: pixel[1],
            }),
            map: mapInstanceRef.current,
          }
          drawInteractionRef.current.handleEvent(fakeDown)
          drawInteractionRef.current.handleEvent(fakeUp)
        }
      } catch (e) {
        /* Ignore */
      }
    })
  }, [
    isDrawing,
    removeInteraction,
    clearSketchListener,
    updateMeasurementDisplay,
    drawingStyle,
    confirmAppend,
    cancelAppend,
  ])

  // --- Editing Actions ---
  const applyNumericInput = useCallback(() => {
    const map = mapInstanceRef.current
    const currentActiveFeature = activeFeatureRef.current
    if (!isEditingRef.current || !currentActiveFeature || !map) return
    const geom = currentActiveFeature.getGeometry()
    const coords = geom?.getCoordinates()
    if (
      !coords ||
      !Array.isArray(coords) ||
      coords.length < 2 ||
      !Array.isArray(coords[0])
    )
      return
    const startPointMapProj = coords[coords.length - 2]
    if (!Array.isArray(startPointMapProj) || startPointMapProj.length < 2)
      return
    const distValue = parseFloat(inputDistance)
    const angleValue = parseFloat(inputAngle)
    if (isNaN(distValue) || isNaN(angleValue) || distValue <= 0) return
    const distanceMeters =
      distanceUnit === 'km'
        ? distValue / METERS_TO_KM
        : distValue / METERS_TO_MILES
    let azimuthDegrees =
      angleUnit === 'deg' ? angleValue : angleValue * RADIANS_TO_DEGREES
    azimuthDegrees = ((azimuthDegrees % 360) + 360) % 360
    const bearingRadians = azimuthDegrees * DEGREES_TO_RADIANS
    const startPointLonLat = toLonLat(startPointMapProj)
    try {
      const newEndPointLonLat = sphereOffset(
        startPointLonLat,
        distanceMeters,
        bearingRadians
      )
      const newEndPointMapProj = fromLonLat(newEndPointLonLat)
      const newCoords = coords.slice(0, -1).concat([newEndPointMapProj])
      geom.setCoordinates(newCoords)
      updateMeasurementDisplay(currentActiveFeature)
    } catch (error) {
      console.error('Error calculating offset:', error)
    }
  }, [
    inputDistance,
    inputAngle,
    distanceUnit,
    angleUnit,
    updateMeasurementDisplay,
  ])

  const deleteEntireLine = useCallback(() => {
    const currentActiveFeature = activeFeatureRef.current
    if (!currentActiveFeature || !vectorSourceRef.current) return
    if (isAppendingRef.current) cancelAppend()
    try {
      vectorSourceRef.current.removeFeature(currentActiveFeature)
    } catch (e) {
      /* Ignore */
    }
    if (selectInteractionRef.current)
      selectInteractionRef.current.getFeatures().clear()
    setActiveFeature(null)
    if (vectorSourceRef.current?.getFeatures().length === 0) {
      setIsEditing(false)
    }
  }, [cancelAppend])

  const deleteLastVertex = useCallback(() => {
    const currentActiveFeature = activeFeatureRef.current
    if (!currentActiveFeature || isAppendingRef.current) return
    const geom = currentActiveFeature.getGeometry()
    const coords = geom?.getCoordinates()
    if (coords && Array.isArray(coords)) {
      if (coords.length > 2) {
        const newCoords = coords.slice(0, -1)
        try {
          geom.setCoordinates(newCoords)
          updateMeasurementDisplay(currentActiveFeature)
        } catch (e) {
          /* Ignore */
        }
      } else {
        deleteEntireLine()
      }
    } else {
      deleteEntireLine()
    }
  }, [updateMeasurementDisplay, deleteEntireLine])

  // --- Drawing Mode Callbacks ---
  const cancelDrawing = useCallback(() => {
    // Check only isDrawing state and existence of the interaction ref
    if (isDrawing && drawInteractionRef.current) {
      try {
        // Use internal abort method. No need for getSource() check.
        if (typeof drawInteractionRef.current.abortDrawing === 'function') {
          if (drawInteractionRef.current.sketchFeature_)
            drawInteractionRef.current.abortDrawing()
        } else if (
          typeof drawInteractionRef.current.abortDrawing_ === 'function'
        ) {
          // Older OL?
          if (drawInteractionRef.current.sketchFeature_)
            drawInteractionRef.current.abortDrawing_()
        }
      } catch (e) {
        console.warn('Error during abortDrawing:', e)
      }
    }
    // Always cleanup state and interaction ref if isDrawing is true
    if (isDrawing) {
      removeInteraction(drawInteractionRef)
      clearSketchListener()
      setIsDrawing(false)
      updateMeasurementDisplay(null)
    }
  }, [
    isDrawing,
    removeInteraction,
    clearSketchListener,
    updateMeasurementDisplay,
  ]) // isDrawing dependency is crucial

  const finishDrawing = useCallback(() => {
    // Check only isDrawing state and existence of the interaction ref
    if (isDrawing && drawInteractionRef.current) {
      try {
        if (drawInteractionRef.current.sketchFeature_) {
          const sketchCoords = drawInteractionRef.current.sketchFeature_
            .getGeometry()
            ?.getCoordinates()
          if (sketchCoords && sketchCoords.length > 1) {
            // finishDrawing triggers 'drawend' which should handle interaction removal & state reset
            drawInteractionRef.current.finishDrawing()
          } else {
            cancelDrawing() // Not enough points
          }
        } else {
          cancelDrawing() // No sketch started
        }
      } catch (e) {
        console.error('Error finishing drawing:', e)
        cancelDrawing() // Cancel on error
      }
    }
  }, [isDrawing, cancelDrawing]) // isDrawing dependency is crucial

  const startDrawing = useCallback(() => {
    if (
      !mapInstanceRef.current ||
      isDrawing ||
      isEditingRef.current ||
      isAppendingRef.current
    )
      return
    cancelAppend()
    removeInteraction(drawInteractionRef)
    clearSketchListener()
    const drawInteraction = new Draw({
      source: vectorSourceRef.current,
      type: 'LineString',
      style: drawingStyle,
    })
    drawInteractionRef.current = drawInteraction
    mapInstanceRef.current.addInteraction(drawInteraction)
    setIsDrawing(true)
    updateMeasurementDisplay(null)
    let currentFeature = null
    drawInteraction.on('drawstart', (evt) => {
      if (!isDrawing) return
      currentFeature = evt.feature
      updateMeasurementDisplay(null)
      const geom = currentFeature.getGeometry()
      if (geom) {
        clearSketchListener()
        sketchListenerRef.current = geom.on('change', () => {
          if (isDrawing && currentFeature === evt.feature)
            updateMeasurementDisplay(currentFeature, true)
        })
      }
    })
    drawInteraction.on('drawend', (evt) => {
      // Draw 'drawend' handles cleanup for finishDrawing case
      const feature = evt.feature || currentFeature
      if (feature) {
        feature.setStyle(null)
        updateMeasurementDisplay(feature, true)
      }
      if (drawInteractionRef.current === drawInteraction)
        removeInteraction(drawInteractionRef) // Remove interaction
      clearSketchListener()
      setIsDrawing(false) // Reset state
      currentFeature = null
    })
  }, [
    isDrawing,
    cancelAppend,
    removeInteraction,
    clearSketchListener,
    updateMeasurementDisplay,
    drawingStyle,
  ])

  // --- Edit Mode Toggle ---
  const toggleEditMode = useCallback(() => {
    if (isDrawing || isAppendingRef.current) return
    setIsEditing((prev) => !prev)
  }, [isDrawing])

  // ============================================================== //
  // useEffect Hooks                                                //
  // ============================================================== //

  // Sync state to refs
  useEffect(() => {
    activeFeatureRef.current = activeFeature
  }, [activeFeature])
  useEffect(() => {
    isEditingRef.current = isEditing
  }, [isEditing])
  useEffect(() => {
    isAppendingRef.current = isAppending
  }, [isAppending])

  // Update measurement & redraw layer on active feature change
  useEffect(() => {
    mainVectorLayerRef.current?.changed()
    updateMeasurementDisplay(activeFeature)
  }, [activeFeature, updateMeasurementDisplay])

  // Redraw layer style when editing/appending state changes
  useEffect(() => {
    mainVectorLayerRef.current?.changed()
  }, [isEditing, isAppending])

  // --- Map Initialization & Cleanup ---
  useEffect(() => {
    if (!mapRef.current) return
    const vectorLayer = new VectorLayer({
      source: vectorSourceRef.current,
      style: layerStyleFunction,
    })
    mainVectorLayerRef.current = vectorLayer
    const map = new Map({
      target: mapRef.current,
      interactions: defaultInteractions({
        doubleClickZoom: false,
        altShiftDragRotate: false,
        pinchRotate: false,
      }),
      layers: [new TileLayer({ source: new OSM() }), vectorLayer],
      view: new View({ center: fromLonLat([0, 0]), zoom: 2 }),
      controls: [],
    })
    mapInstanceRef.current = map
    return () => {
      // Unmount cleanup
      removeInteraction(drawInteractionRef)
      removeInteraction(selectInteractionRef)
      removeInteraction(modifyInteractionRef)
      clearSketchListener()
      if (pointerMoveListenerKey.current)
        unByKey(pointerMoveListenerKey.current)
      if (appendLayerRef.current && mapInstanceRef.current)
        mapInstanceRef.current.removeLayer(appendLayerRef.current)
      if (mapInstanceRef.current) mapInstanceRef.current.setTarget(null)
      mapInstanceRef.current = null
      mainVectorLayerRef.current = null
      vectorSourceRef.current?.clear()
      activeFeatureRef.current = null
      drawInteractionRef.current = null
      selectInteractionRef.current = null
      modifyInteractionRef.current = null
      appendLayerRef.current = null
      appendSourceRef.current = null
      appendSketchFeatureRef.current = null
      backupCoordsRef.current = null
      pointerMoveListenerKey.current = null
    }
  }, [layerStyleFunction, removeInteraction, clearSketchListener]) // Stable callbacks

  // --- Feature Count Listener ---
  useEffect(() => {
    const source = vectorSourceRef.current
    if (!source) return
    let mounted = true
    const updateCount = () => {
      try {
        if (mounted && source) setFeaturesCount(source.getFeatures().length)
      } catch (e) {
        /* ignore */
      }
    }
    updateCount()
    const addKey = source.on('addfeature', updateCount)
    const removeKey = source.on('removefeature', updateCount)
    return () => {
      mounted = false
      unByKey([addKey, removeKey])
    }
  }, [])

  // --- EDITING MODE Setup/Cleanup Effect ---
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return
    removeInteraction(selectInteractionRef)
    removeInteraction(modifyInteractionRef)
    if (isEditing) {
      const select = new Select({
        hitTolerance: 5,
        filter: (f, l) => l === mainVectorLayerRef.current,
        style: null,
      })
      selectInteractionRef.current = select
      map.addInteraction(select)
      select.on('select', (e) => {
        if (isAppendingRef.current) {
          if (e.selected.length > 0) select.getFeatures().clear()
          return
        }
        setActiveFeature(e.selected.length > 0 ? e.selected[0] : null)
      })
      const modify = new Modify({
        features: select.getFeatures(),
        style: modifyVertexStyle,
        insertVertexCondition: never,
      })
      modifyInteractionRef.current = modify
      map.addInteraction(modify)
      modify.on('modifyend', (e) => {
        if (isAppendingRef.current) return
        if (e.features.getLength() > 0) {
          const modifiedFeature = e.features.item(0)
          if (modifiedFeature === activeFeatureRef.current)
            updateMeasurementDisplay(modifiedFeature)
        }
      })
    } else {
      if (isAppendingRef.current) cancelAppend()
      if (activeFeatureRef.current) setActiveFeature(null)
    }
    return () => {
      removeInteraction(selectInteractionRef)
      removeInteraction(modifyInteractionRef)
      if (!isEditingRef.current && isAppendingRef.current) cancelAppend()
    }
  }, [isEditing, cancelAppend, updateMeasurementDisplay, removeInteraction])

  // --- **** NEW: Angle Hover Effect **** ---
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return () => {} // Ensure map exists

    const handlePointerMove = (evt) => {
      if (evt.dragging || isDrawing || isAppendingRef.current) {
        // Don't check during drag, draw, or append
        setHoveredAngle(null)
        return
      }

      let foundVertex = false
      // Check features at the pixel
      map.forEachFeatureAtPixel(
        evt.pixel,
        (feature, layer) => {
          if (foundVertex) return // Stop if we already found one
          if (
            layer === mainVectorLayerRef.current &&
            feature.getGeometry() instanceof LineString
          ) {
            const geometry = feature.getGeometry()
            const coords = geometry.getCoordinates()

            // Check proximity to each vertex (excluding endpoints)
            for (let i = 1; i < coords.length - 1; i++) {
              const vertexPixel = map.getPixelFromCoordinate(coords[i])
              if (!vertexPixel) continue

              const dx = evt.pixel[0] - vertexPixel[0]
              const dy = evt.pixel[1] - vertexPixel[1]
              const distSq = dx * dx + dy * dy

              if (distSq <= PIXEL_TOLERANCE_SQ) {
                const angle = calculateAngleAtVertex(
                  coords[i - 1],
                  coords[i],
                  coords[i + 1]
                )
                setHoveredAngle(angle)
                foundVertex = true
                break // Stop checking vertices for this feature
              }
            }
          }
        },
        { hitTolerance: 5 }
      ) // Use hit tolerance

      // If no vertex was found near the pointer
      if (!foundVertex) {
        setHoveredAngle(null)
      }
    }

    // Add listener
    pointerMoveListenerKey.current = map.on('pointermove', handlePointerMove)

    // Cleanup listener on unmount or map change
    return () => {
      if (pointerMoveListenerKey.current) {
        unByKey(pointerMoveListenerKey.current)
        pointerMoveListenerKey.current = null
      }
    }
  }, [calculateAngleAtVertex, isDrawing]) // Rerun if map instance or calculation logic changes

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const container = mapRef.current // Target the map container
    if (!container) return

    const handleKeyDown = (e) => {
      // Check if the event target is the map container itself or within it
      // This helps prevent triggering shortcuts when focus is on input fields etc.
      // However, allow Esc to work more globally.
      const isMapFocused = document.activeElement === container

      if (e.key === 'Enter') {
        // Only trigger Enter actions if map itself has focus or is within focus tree (maybe too broad?)
        // Let's be stricter: only if map div has focus
        if (!isMapFocused) return

        e.preventDefault() // Prevent default Enter behavior (like form submission)
        // Finish Append
        if (isAppendingRef.current) {
          if (drawInteractionRef.current?.finishDrawing) {
            try {
              const sketchFeature = drawInteractionRef.current.sketchFeature_
              const sketchCoords = sketchFeature
                ?.getGeometry()
                ?.getCoordinates()
              if (
                sketchFeature &&
                sketchCoords &&
                sketchCoords.length > (backupCoordsRef.current?.length ?? 0)
              ) {
                drawInteractionRef.current.finishDrawing()
              } else {
                cancelAppend()
              }
            } catch (err) {
              cancelAppend()
            }
          } else {
            cancelAppend()
          }
        }
        // Finish Drawing (Standard)
        else if (isDrawing) {
          finishDrawing()
        }
      } else if (e.key === 'Escape') {
        e.preventDefault() // Prevent default Esc behavior
        // Cancel Append
        if (isAppendingRef.current) {
          cancelAppend()
        }
        // Cancel Drawing (Standard)
        else if (isDrawing) {
          cancelDrawing()
        }
        // Deselect Feature in Edit Mode
        else if (isEditingRef.current && activeFeatureRef.current) {
          if (selectInteractionRef.current)
            try {
              selectInteractionRef.current.getFeatures().clear()
            } catch (err) {
              /* ignore */
            }
          setActiveFeature(null)
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => {
      if (container) container.removeEventListener('keydown', handleKeyDown)
    }
  }, [
    isDrawing,
    isEditing,
    isAppending,
    finishDrawing,
    cancelDrawing,
    cancelAppend,
  ]) // Add all relevant state dependencies

  // --- RENDER ---
  const showNumericInputs = isEditing && !!activeFeature
  const numericInputDisabled = !showNumericInputs
  const startDrawingDisabled = isDrawing || isEditing || isAppending
  const editButtonDisabled =
    isDrawing || isAppending || (!isEditing && featuresCount === 0)
  const startAppendDisabled = !isEditing || isAppending || !activeFeature
  const editActionDisabled = !isEditing || isAppending || !activeFeature

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Map Container */}
      <div
        ref={mapRef}
        tabIndex="0" // Make map div focusable
        style={{
          width: '80vw',
          height: '100%',
          outline: 'none',
          cursor:
            isDrawing || isAppending
              ? 'crosshair'
              : isEditing
                ? 'pointer'
                : 'grab',
        }}
      />
      {/* Control Panel */}
      <div
        style={{
          width: '20vw',
          minWidth: '250px',
          backgroundColor: '#f8f9fa',
          padding: '1rem',
          boxSizing: 'border-box',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {/* Measurement Display */}
        <div>
          <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Last Segment</h3>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.5rem',
            }}
          >
            <span>Distance: {displayDistance()}</span>
            <button
              onClick={toggleDistanceUnit}
              style={{
                padding: '2px 5px',
                cursor: 'pointer',
                fontSize: '0.8em',
              }}
              title={`Switch to ${distanceUnit === 'km' ? 'miles' : 'kilometers'}`}
            >
              {distanceUnit === 'km' ? 'Use mi' : 'Use km'}
            </button>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>Azimuth: {displayAzimuth()}</span>
            <button
              onClick={toggleAngleUnit}
              style={{
                padding: '2px 5px',
                cursor: 'pointer',
                fontSize: '0.8em',
              }}
              title={`Switch to ${angleUnit === 'deg' ? 'radians' : 'degrees'}`}
            >
              {angleUnit === 'deg' ? 'Use rad' : 'Use deg'}
            </button>
          </div>
        </div>

        <div>
          <h3 style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
            Hovered Vertex
          </h3>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>Angle: {displayHoveredAngle()}</span>
            <button
              onClick={toggleHoveredAngleUnit}
              style={{
                padding: '2px 5px',
                cursor: 'pointer',
                fontSize: '0.8em',
              }}
              title={`Switch to ${hoveredAngleUnit === 'deg' ? 'radians' : 'degrees'}`}
            >
              {hoveredAngleUnit === 'deg' ? 'Use rad' : 'Use deg'}
            </button>
          </div>
        </div>

        {/* Numeric Input */}
        <div
          style={{
            border: '1px solid #ccc',
            borderRadius: '4px',
            padding: '0.5rem',
            opacity: showNumericInputs ? 1 : 0.5,
            transition: 'opacity 0.3s ease',
            marginTop: '1rem',
          }}
        >
          <label
            style={{
              display: 'block',
              marginBottom: '0.2rem',
              fontSize: '0.9em',
              fontWeight: 'bold',
            }}
          >
            Set Last Segment
          </label>
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              marginBottom: '0.5rem',
            }}
          >
            <input
              type="number"
              name="distance"
              value={inputDistance}
              onChange={handleInputChange}
              placeholder="Length"
              aria-label={`Distance in ${distanceUnit}`}
              style={{ width: '70px', padding: '4px' }}
              disabled={numericInputDisabled}
              step="any"
            />
            <span>{distanceUnit}</span>
            <input
              type="number"
              name="angle"
              value={inputAngle}
              onChange={handleInputChange}
              placeholder="Azimuth"
              aria-label={`Azimuth in ${angleUnit}`}
              style={{ width: '70px', padding: '4px' }}
              disabled={numericInputDisabled}
              step="any"
            />
            <span>{angleUnit}</span>
          </div>
          <button
            onClick={applyNumericInput}
            disabled={numericInputDisabled}
            title={
              numericInputDisabled
                ? 'Select line in Edit Mode'
                : 'Apply length and azimuth'
            }
            style={{
              padding: '4px 8px',
              cursor: numericInputDisabled ? 'not-allowed' : 'pointer',
            }}
          >
            Apply
          </button>
          {!showNumericInputs && (
            <small
              style={{ display: 'block', marginTop: '4px', color: '#666' }}
            >
              Select line in Edit Mode.
            </small>
          )}
          {showNumericInputs && (
            <small
              style={{ display: 'block', marginTop: '4px', color: 'blue' }}
            >
              Modifies selected line's last segment.
            </small>
          )}
        </div>

        {/* Drawing Controls */}
        <div style={{ marginTop: '1rem' }}>
          <button
            onClick={startDrawing}
            disabled={startDrawingDisabled}
            style={{ cursor: startDrawingDisabled ? 'not-allowed' : 'pointer' }}
          >
            Start Drawing Line
          </button>
          {isDrawing && (
            <div
              style={{
                marginTop: '0.5rem',
                border: '1px dashed grey',
                padding: '0.5rem',
                backgroundColor: '#eee',
              }}
            >
              <div style={{ fontWeight: 'bold' }}>Drawing...</div>
              <div>Click points. Enter/Dbl-click=Finish. Esc=Cancel.</div>
              {/* Cancel button wired directly to cancelDrawing */}
              <button
                onClick={cancelDrawing}
                style={{ marginTop: '0.5rem', cursor: 'pointer', color: 'red' }}
              >
                Cancel Drawing
              </button>
            </div>
          )}
        </div>

        {/* Edit Mode Toggle */}
        <div style={{ marginTop: '0.5rem' }}>
          <button
            onClick={toggleEditMode}
            disabled={editButtonDisabled}
            style={{
              cursor: editButtonDisabled ? 'not-allowed' : 'pointer',
              fontWeight: isEditing ? 'bold' : 'normal',
            }}
          >
            {isEditing ? 'Exit Edit Mode' : 'Edit Drawn Lines'}
          </button>
          {featuresCount === 0 && !isEditing && (
            <small
              style={{ display: 'block', marginTop: '4px', color: '#666' }}
            >
              Draw a line first.
            </small>
          )}
        </div>

        {/* Editing Controls */}
        {isEditing && (
          <div
            style={{
              borderTop: '1px solid #ccc',
              paddingTop: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              marginTop: '0.5rem',
            }}
          >
            {!activeFeature ? (
              <div style={{ color: '#555' }}>
                Select a line on the map to edit.
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 'bold' }}>Editing Selected Line:</div>
                <div
                  style={{
                    border: isAppending
                      ? '1px dashed blue'
                      : '1px solid transparent',
                    padding: '0.5rem',
                    backgroundColor: isAppending ? '#e0e8ff' : 'transparent',
                    transition:
                      'padding 0.3s ease, border 0.3s ease, background-color 0.3s ease',
                  }}
                >
                  <button
                    onClick={startAppend}
                    disabled={startAppendDisabled}
                    style={{
                      cursor: startAppendDisabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Append Segment(s)
                  </button>
                  {isAppending && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <div style={{ fontWeight: 'bold' }}>Appending...</div>
                      <div>
                        Click points. Enter/Dbl-click=Confirm. Esc=Cancel.
                      </div>
                      {/* Cancel button wired directly to cancelAppend */}
                      <button
                        onClick={cancelAppend}
                        style={{
                          marginTop: '0.5rem',
                          cursor: 'pointer',
                          color: 'red',
                        }}
                      >
                        Cancel Append
                      </button>
                    </div>
                  )}
                </div>
                <div
                  style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
                >
                  <button
                    onClick={deleteLastVertex}
                    disabled={editActionDisabled}
                    style={{
                      cursor: editActionDisabled ? 'not-allowed' : 'pointer',
                    }}
                    title={
                      editActionDisabled
                        ? 'Select line / Cannot use while appending'
                        : 'Remove last point'
                    }
                  >
                    Delete Last Vertex
                  </button>
                  <button
                    onClick={deleteEntireLine}
                    disabled={editActionDisabled}
                    style={{
                      cursor: editActionDisabled ? 'not-allowed' : 'pointer',
                      color: 'darkred',
                    }}
                    title={
                      editActionDisabled
                        ? 'Select line / Cannot use while appending'
                        : 'Delete entire line'
                    }
                  >
                    Delete Entire Line
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default MapComponent
