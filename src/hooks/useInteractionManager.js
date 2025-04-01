import { useState, useRef, useEffect, useCallback } from 'react'
import Draw from 'ol/interaction/Draw'
import Select from 'ol/interaction/Select'
import Modify from 'ol/interaction/Modify'
import LineString from 'ol/geom/LineString'
import { never } from 'ol/events/condition'
import {
  removeInteraction,
  clearListener,
  calculateOffsetCoord,
} from '../mapUtils'
import { drawingStyle, modifyVertexStyle } from '../styles' // Import necessary styles

// This hook manages the state and interactions for Drawing, Editing, and Appending
const useInteractionManager = (
  mapInstanceRef,
  vectorSourceRef,
  mainVectorLayerRef,
  updateMeasurement,
  clearInputs // Add clearInputs callback
) => {
  // State
  const [isDrawing, setIsDrawing] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isAppending, setIsAppending] = useState(false)
  const [activeFeature, setActiveFeature] = useState(null)

  // Interaction Refs
  const drawInteractionRef = useRef(null)
  const selectInteractionRef = useRef(null)
  const modifyInteractionRef = useRef(null)
  const sketchListenerRef = useRef(null) // For sketch changes during draw/append
  const appendLayerRef = useRef(null) // Temp layer for append visualization
  const appendSourceRef = useRef(null) // Temp source for append drawing
  const appendSketchFeatureRef = useRef(null) // Feature being drawn during append
  const backupCoordsRef = useRef(null) // Coords before append starts

  // Derived State Refs (for callbacks)
  const isAppendingRef = useRef(isAppending)
  const isEditingRef = useRef(isEditing)
  const activeFeatureRef = useRef(activeFeature)

  useEffect(() => {
    isAppendingRef.current = isAppending
  }, [isAppending])
  useEffect(() => {
    isEditingRef.current = isEditing
  }, [isEditing])
  useEffect(() => {
    activeFeatureRef.current = activeFeature
  }, [activeFeature])

  // --- Interaction Cleanup Helper ---
  const cleanupAllInteractions = useCallback(() => {
    const map = mapInstanceRef.current
    if (!map) return
    removeInteraction(map, drawInteractionRef)
    removeInteraction(map, selectInteractionRef)
    removeInteraction(map, modifyInteractionRef)
    clearListener(sketchListenerRef)
    if (appendLayerRef.current) {
      try {
        map.removeLayer(appendLayerRef.current)
      } catch (e) {
        /* ignore */
      }
      appendLayerRef.current = null
    }
    if (appendSourceRef.current) {
      try {
        appendSourceRef.current.clear()
      } catch (e) {
        /* ignore */
      }
      appendSourceRef.current = null
    }
    appendSketchFeatureRef.current = null
    backupCoordsRef.current = null
  }, [mapInstanceRef])

  // --- Append Logic ---
  const cleanupAppend = useCallback(() => {
    const map = mapInstanceRef.current
    if (!map) return
    removeInteraction(map, drawInteractionRef) // Specific removal
    clearListener(sketchListenerRef)
    if (appendLayerRef.current)
      try {
        map.removeLayer(appendLayerRef.current)
      } catch (e) {
        /*i*/
      }
    if (appendSourceRef.current)
      try {
        appendSourceRef.current.clear()
      } catch (e) {
        /*i*/
      }
    appendLayerRef.current = null
    appendSourceRef.current = null
    appendSketchFeatureRef.current = null
    backupCoordsRef.current = null
    if (isEditingRef.current && selectInteractionRef.current) {
      try {
        if (
          map
            .getInteractions()
            .getArray()
            .includes(selectInteractionRef.current)
        )
          selectInteractionRef.current.setActive(true)
      } catch (e) {
        /*i*/
      }
    }
    setIsAppending(false)
  }, [mapInstanceRef])

  const cancelAppend = useCallback(() => {
    if (activeFeatureRef.current)
      updateMeasurement(activeFeatureRef.current) // Restore measurement
    else updateMeasurement(null)
    cleanupAppend()
  }, [cleanupAppend, updateMeasurement])

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
      updateMeasurement(currentActiveFeature) // Update with final segment
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
    setActiveFeature(null) // Deselect
    cleanupAppend()
  }, [cancelAppend, cleanupAppend, updateMeasurement])

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

    // Deactivate interactions
    if (selectInteractionRef.current)
      try {
        selectInteractionRef.current.setActive(false)
      } catch (e) {
        /* Ignore */
      }
    if (modifyInteractionRef.current)
      try {
        modifyInteractionRef.current.setActive(false)
      } catch (e) {
        /* Ignore */
      } // Also deactivate modify
    removeInteraction(map, drawInteractionRef) // Remove any existing draw
    clearListener(sketchListenerRef)

    backupCoordsRef.current = JSON.parse(JSON.stringify(coords))
    const startCoord = coords[coords.length - 1]
    setIsAppending(true) // Set state

    // Setup temporary layer/source
    if (appendLayerRef.current)
      try {
        map.removeLayer(appendLayerRef.current)
      } catch (e) {
        /*i*/
      }
    if (appendSourceRef.current)
      try {
        appendSourceRef.current.clear()
      } catch (e) {
        /*i*/
      }
    appendSourceRef.current = new VectorSource()
    appendLayerRef.current = new VectorLayer({
      source: appendSourceRef.current,
      style: drawingStyle,
      zIndex: 10,
    })
    map.addLayer(appendLayerRef.current)

    const geometryFunction = (drawCoords, geometry) => {
      // ... (geometry function logic as before, calling updateMeasurement) ...
      if (
        !isAppendingRef.current ||
        !backupCoordsRef.current ||
        !Array.isArray(backupCoordsRef.current)
      )
        return geometry ? geometry.setCoordinates([]) : new LineString([])
      const currentSketchPoints = drawCoords
      const newPoints =
        currentSketchPoints.length > 1 ? currentSketchPoints.slice(1) : []
      const combinedCoords = backupCoordsRef.current.concat(newPoints)
      if (!geometry) geometry = new LineString(combinedCoords)
      else geometry.setCoordinates(combinedCoords)
      if (geometry.getCoordinates().length > backupCoordsRef.current.length)
        updateMeasurement(geometry, true)
      else if (
        geometry.getCoordinates().length === backupCoordsRef.current.length &&
        backupCoordsRef.current.length > 1
      )
        updateMeasurement(
          new LineString(backupCoordsRef.current.slice(-2)),
          true
        )
      else updateMeasurement(null, true)
      return geometry
    }

    // Create Append Draw interaction
    const appendDraw = new Draw({
      source: appendSourceRef.current,
      type: 'LineString',
      style: drawingStyle,
      geometryFunction,
      condition: (e) => e.originalEvent.pointerType !== 'touch',
      freehandCondition: never,
    })
    drawInteractionRef.current = appendDraw // Use the main draw ref for the active draw interaction
    map.addInteraction(appendDraw)

    appendDraw.on('drawstart', (evt) => {
      if (!isAppendingRef.current) return
      appendSketchFeatureRef.current = evt.feature
      clearListener(sketchListenerRef)
    })
    appendDraw.on('drawend', (evt) => {
      clearListener(sketchListenerRef)
      if (isAppendingRef.current && evt.feature) {
        appendSketchFeatureRef.current = evt.feature
        confirmAppend()
      } else if (isAppendingRef.current) {
        cancelAppend()
      }
    })

    // Simulate click (as before)
    requestAnimationFrame(() => {
      if (
        !isAppendingRef.current ||
        !map ||
        !drawInteractionRef.current ||
        !backupCoordsRef.current ||
        !Array.isArray(startCoord) ||
        startCoord.length < 2
      )
        return
      try {
        const pixel = map.getPixelFromCoordinate(startCoord)
        if (!pixel || pixel.length < 2) return
        if (drawInteractionRef.current?.handleEvent) {
          const fakeDown = {
            type: 'pointerdown',
            coordinate: startCoord,
            pixel: pixel,
            originalEvent: new PointerEvent('pointerdown', {
              clientX: pixel[0],
              clientY: pixel[1],
            }),
            map: map,
          }
          const fakeUp = {
            type: 'pointerup',
            coordinate: startCoord,
            pixel: pixel,
            originalEvent: new PointerEvent('pointerup', {
              clientX: pixel[0],
              clientY: pixel[1],
            }),
            map: map,
          }
          drawInteractionRef.current.handleEvent(fakeDown)
          drawInteractionRef.current.handleEvent(fakeUp)
        }
      } catch (e) {
        /* Ignore */
      }
    })
  }, [
    mapInstanceRef,
    activeFeature,
    isDrawing,
    isAppending,
    isEditing,
    drawingStyle,
    cleanupAppend,
    cancelAppend,
    confirmAppend,
    updateMeasurement,
  ]) // Dependencies

  // --- Drawing Logic ---
  const cancelDrawing = useCallback(() => {
    const map = mapInstanceRef.current
    if (isDrawing && drawInteractionRef.current) {
      try {
        if (drawInteractionRef.current.sketchFeature_) {
          if (typeof drawInteractionRef.current.abortDrawing === 'function')
            drawInteractionRef.current.abortDrawing()
          else if (
            typeof drawInteractionRef.current.abortDrawing_ === 'function'
          )
            drawInteractionRef.current.abortDrawing_()
        }
      } catch (e) {
        console.warn('Error aborting drawing:', e)
      }
    }
    if (isDrawing) {
      // Always cleanup state if was drawing
      removeInteraction(map, drawInteractionRef)
      clearListener(sketchListenerRef)
      setIsDrawing(false)
      updateMeasurement(null)
    }
  }, [isDrawing, mapInstanceRef, updateMeasurement])

  const finishDrawing = useCallback(() => {
    if (isDrawing && drawInteractionRef.current) {
      try {
        if (drawInteractionRef.current.sketchFeature_) {
          const sketchCoords = drawInteractionRef.current.sketchFeature_
            .getGeometry()
            ?.getCoordinates()
          if (sketchCoords && sketchCoords.length > 1) {
            drawInteractionRef.current.finishDrawing() // Triggers drawend
          } else {
            cancelDrawing()
          } // Not enough points
        } else {
          cancelDrawing()
        } // No sketch started
      } catch (e) {
        console.error('Error finishing drawing:', e)
        cancelDrawing()
      }
    }
  }, [isDrawing, cancelDrawing])

  const startDrawing = useCallback(() => {
    const map = mapInstanceRef.current
    const source = vectorSourceRef.current
    if (!map || !source || isDrawing || isEditing || isAppending) return

    cleanupAllInteractions() // Clear previous interactions/state
    setActiveFeature(null) // Ensure no selection

    const draw = new Draw({
      source: source,
      type: 'LineString',
      style: drawingStyle,
    })
    drawInteractionRef.current = draw
    map.addInteraction(draw)
    setIsDrawing(true)
    updateMeasurement(null) // Clear measurements

    let currentFeature = null
    draw.on('drawstart', (evt) => {
      if (!isDrawing) return // State check
      currentFeature = evt.feature
      updateMeasurement(null)
      const geom = currentFeature.getGeometry()
      if (geom) {
        clearListener(sketchListenerRef)
        sketchListenerRef.current = geom.on('change', () => {
          if (isDrawing && currentFeature === evt.feature)
            updateMeasurement(currentFeature, true)
        })
      }
    })
    draw.on('drawend', (evt) => {
      const feature = evt.feature || currentFeature
      if (feature) {
        feature.setStyle(null)
        updateMeasurement(feature, true)
      }
      // Cleanup handled by the effect watching isDrawing
      clearListener(sketchListenerRef)
      setIsDrawing(false) // This state change triggers cleanup effect
      currentFeature = null
    })
  }, [
    mapInstanceRef,
    vectorSourceRef,
    isDrawing,
    isEditing,
    isAppending,
    drawingStyle,
    cleanupAllInteractions,
    updateMeasurement,
  ])

  // --- Editing Logic ---
  const toggleEditMode = useCallback(() => {
    if (isDrawing || isAppending) return // Prevent toggling during other actions
    setIsEditing((prev) => {
      const nextState = !prev
      if (!nextState) {
        // Exiting edit mode
        cleanupAllInteractions()
        setActiveFeature(null)
        clearInputs() // Clear numeric inputs when exiting edit mode
      }
      // Setup/cleanup handled by the effect watching isEditing
      return nextState
    })
  }, [isDrawing, isAppending, cleanupAllInteractions, clearInputs])

  const deleteEntireLine = useCallback(() => {
    const map = mapInstanceRef.current
    const source = vectorSourceRef.current
    const currentActiveFeature = activeFeatureRef.current
    if (!map || !source || !currentActiveFeature || isAppendingRef.current)
      return
    try {
      source.removeFeature(currentActiveFeature)
    } catch (e) {
      /* Ignore */
    }
    if (selectInteractionRef.current)
      try {
        selectInteractionRef.current.getFeatures().clear()
      } catch (e) {
        /*i*/
      }
    setActiveFeature(null)
    updateMeasurement(null)
    // Optionally exit edit mode if no features left (handled by feature count listener elsewhere)
  }, [mapInstanceRef, vectorSourceRef, updateMeasurement])

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
          updateMeasurement(currentActiveFeature)
        } catch (e) {
          /* Ignore */
        }
      } else {
        deleteEntireLine()
      } // Delete line if only 2 points remain
    } else {
      deleteEntireLine()
    } // Delete if coords invalid
  }, [updateMeasurement, deleteEntireLine])

  const applyNumericInput = useCallback(
    (distance, angle, distanceUnit, angleUnit) => {
      const currentActiveFeature = activeFeatureRef.current
      if (
        !currentActiveFeature ||
        !isEditingRef.current ||
        isAppendingRef.current
      )
        return
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

      const newEndPointMapProj = calculateOffsetCoord(
        startPointMapProj,
        distance,
        angle,
        distanceUnit,
        angleUnit
      )

      if (newEndPointMapProj) {
        const newCoords = coords.slice(0, -1).concat([newEndPointMapProj])
        try {
          geom.setCoordinates(newCoords)
          updateMeasurement(currentActiveFeature) // Update measurement display
        } catch (e) {
          console.error('Error setting coordinates from numeric input:', e)
        }
      }
    },
    [updateMeasurement]
  )

  // --- Effect for Managing Interactions based on State ---
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    // Cleanup existing Select/Modify first
    removeInteraction(map, selectInteractionRef)
    removeInteraction(map, modifyInteractionRef)

    // If Editing Mode is Active
    if (isEditing && !isDrawing && !isAppending) {
      // Create Select
      const select = new Select({
        hitTolerance: 5,
        filter: (f, l) => l === mainVectorLayerRef.current,
        style: null,
      })
      selectInteractionRef.current = select
      map.addInteraction(select)

      select.on('select', (e) => {
        if (isAppendingRef.current) {
          // Should not happen if state logic is correct, but safeguard
          if (e.selected.length > 0) {
            select.getFeatures().clear()
            return
          }
        }
        const selectedFeature = e.selected.length > 0 ? e.selected[0] : null
        setActiveFeature(selectedFeature)
        updateMeasurement(selectedFeature) // Update measurement on select
      })

      // Create Modify
      const modify = new Modify({
        features: select.getFeatures(),
        style: modifyVertexStyle,
        insertVertexCondition: never,
      })
      modifyInteractionRef.current = modify
      map.addInteraction(modify)

      modify.on('modifyend', (e) => {
        if (isAppendingRef.current) return // Safeguard
        if (e.features.getLength() > 0) {
          const modifiedFeature = e.features.item(0)
          if (modifiedFeature === activeFeatureRef.current)
            updateMeasurement(modifiedFeature)
        }
      })
    }

    // If Drawing state becomes false, ensure draw interaction is removed
    if (!isDrawing) {
      removeInteraction(map, drawInteractionRef) // Handles both normal draw and append draw if active
      clearListener(sketchListenerRef)
    }

    // Cleanup on unmount or when dependencies change triggering a cleanup cycle
    return () => {
      // General cleanup handled elsewhere or by specific state changes triggering removal
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isEditing,
    isDrawing,
    isAppending,
    mapInstanceRef,
    mainVectorLayerRef,
    updateMeasurement,
  ]) // Key state dependencies

  // --- Effect to Cleanup on Unmount ---
  useEffect(() => {
    // Return a cleanup function that runs only on unmount
    return () => {
      cleanupAllInteractions()
      // Also clear refs owned by this hook that might persist
      activeFeatureRef.current = null
      selectInteractionRef.current = null
      modifyInteractionRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Empty dependency array ensures this runs only on unmount

  return {
    isDrawing,
    isEditing,
    isAppending,
    activeFeature,
    setActiveFeature, // Allow external deselect (e.g., Escape key)

    // Drawing Actions
    startDrawing,
    cancelDrawing,
    finishDrawing,

    // Editing Actions
    toggleEditMode,
    deleteEntireLine,
    deleteLastVertex,
    applyNumericInput, // Needs inputs passed in

    // Appending Actions
    startAppend,
    cancelAppend,
    confirmAppend,
  }
}

export default useInteractionManager
