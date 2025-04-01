import { useRef, useState, useEffect, useCallback } from 'react'
import { Map, View } from 'ol'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { defaults as defaultInteractions } from 'ol/interaction'
import { fromLonLat } from 'ol/proj'
import LineString from 'ol/geom/LineString'
import { unByKey } from 'ol/Observable'
import { finalizedStyle, selectedStyle } from '../styles' // Import necessary styles
import { calculateAngleAtVertex, clearListener } from '../mapUtils'
import { PIXEL_TOLERANCE_SQ } from '../constants'

const useMapCore = (
  setHoveredAngle,
  isDrawing,
  isAppending,
  isEditing,
  activeFeature
) => {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const vectorSourceRef = useRef(new VectorSource())
  const mainVectorLayerRef = useRef(null)
  const [featuresCount, setFeaturesCount] = useState(0)
  const pointerMoveListenerKey = useRef(null)
  const activeFeatureRef = useRef(activeFeature) // Keep ref in sync
  const isEditingRef = useRef(isEditing)
  const isAppendingRef = useRef(isAppending)

  // Sync refs with state props
  useEffect(() => {
    activeFeatureRef.current = activeFeature
  }, [activeFeature])
  useEffect(() => {
    isEditingRef.current = isEditing
  }, [isEditing])
  useEffect(() => {
    isAppendingRef.current = isAppending
  }, [isAppending])

  // Style function now lives within this hook as it needs refs
  const layerStyleFunction = useCallback((feature) => {
    if (isEditingRef.current && feature === activeFeatureRef.current) {
      return selectedStyle
    }
    if (isAppendingRef.current && feature === activeFeatureRef.current) {
      // Keep original selected style during append
      return selectedStyle
    }
    return finalizedStyle
  }, []) // Refs don't need to be dependencies

  // Map Initialization & Cleanup
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return // Prevent re-init

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

    // Feature Count Listener
    const source = vectorSourceRef.current
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

    // Hover Angle Effect Listener
    const handlePointerMove = (evt) => {
      if (evt.dragging || isDrawing || isAppendingRef.current) {
        setHoveredAngle(null)
        return
      }
      let foundVertex = false
      map.forEachFeatureAtPixel(
        evt.pixel,
        (feature, layer) => {
          if (foundVertex) return
          if (
            layer === mainVectorLayerRef.current &&
            feature.getGeometry() instanceof LineString
          ) {
            const geometry = feature.getGeometry()
            const coords = geometry.getCoordinates()
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
                break
              }
            }
          }
        },
        { hitTolerance: 5 }
      )
      if (!foundVertex) setHoveredAngle(null)
    }
    pointerMoveListenerKey.current = map.on('pointermove', handlePointerMove)

    // MAIN CLEANUP FUNCTION
    return () => {
      mounted = false
      unByKey([addKey, removeKey]) // Cleanup feature listeners
      clearListener(pointerMoveListenerKey) // Cleanup hover listener
      // Interactions are cleaned up by their specific hooks

      const mapToCleanup = mapInstanceRef.current // Capture instance before nulling
      if (mapToCleanup) {
        // remove layers? source is cleared below
        mapToCleanup.setTarget(null)
      }
      mapInstanceRef.current = null
      mainVectorLayerRef.current = null
      vectorSourceRef.current?.clear() // Clear features
      activeFeatureRef.current = null // Clear refs related to selection/editing state
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerStyleFunction, setHoveredAngle]) // Only run on mount/unmount essentially, style func is stable

  // Effect to redraw layer when style-affecting states change
  useEffect(() => {
    mainVectorLayerRef.current?.changed()
  }, [isEditing, isAppending, activeFeature, layerStyleFunction]) // layerStyleFunction dependency ensures redraw if it changes

  return {
    mapRef, // The ref object for the div
    mapInstanceRef, // Ref to the map instance
    vectorSourceRef, // Ref to the main vector source
    mainVectorLayerRef, // Ref to the main vector layer
    featuresCount, // Current feature count
    layerStyleFunction, // Export style function if needed elsewhere (e.g., for append layer, though unlikely)
  }
}

export default useMapCore
