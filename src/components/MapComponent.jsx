import React, { useCallback } from 'react'
import { useMapCore } from '../hooks/useMapCore'
import { useMeasurementDisplay } from '../hooks/useMeasurementDisplay'
import { useInteractionManager } from '../hooks/useInteractionManager'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts' // Using the cleaned hook name
import ControlPanel from './ControlPanel'

const MapComponent = () => {
  // Hook for managing measurement state, display logic, and unit toggles
  const {
    setHoveredAngle,
    updateMeasurement,
    clearInputs,
    inputDistance,
    inputAngle,
    distanceUnit,
    angleUnit,
    handleInputChange, // Keep handleInputChange grouped here
    ...measurementDisplayProps // Collect remaining props for ControlPanel
  } = useMeasurementDisplay()

  // Hook managing the core OpenLayers map instance, layers, source, and hover effect
  const {
    mapRef,
    mapInstanceRef,
    vectorSourceRef,
    mainVectorLayerRef,
    featuresCount,
  } = useMapCore(setHoveredAngle) // Pass only needed setters/state

  // Hook managing Draw, Select, Modify interactions and related state (isDrawing, isEditing, etc.)
  const {
    isDrawing,
    isEditing,
    isAppending,
    activeFeature,
    setActiveFeature,
    startDrawing,
    cancelDrawing,
    finishDrawing,
    toggleEditMode,
    deleteEntireLine,
    deleteLastVertex,
    applyNumericInput: applyNumericInputInteraction,
    startAppend,
    cancelAppend,
    confirmAppend,
  } = useInteractionManager(
    mapInstanceRef,
    vectorSourceRef,
    mainVectorLayerRef,
    updateMeasurement,
    clearInputs
  )

  // Define actions for keyboard shortcuts based on current interaction state
  const handleFinishAction = useCallback(() => {
    if (isAppending) confirmAppend()
    else if (isDrawing) finishDrawing()
  }, [isAppending, isDrawing, confirmAppend, finishDrawing])

  const handleCancelAction = useCallback(() => {
    if (isAppending) cancelAppend()
    else if (isDrawing) cancelDrawing()
    else if (isEditing && activeFeature) setActiveFeature(null) // Deselect feature if editing
  }, [
    isAppending,
    isDrawing,
    isEditing,
    activeFeature,
    cancelAppend,
    cancelDrawing,
    setActiveFeature,
  ])

  // Hook to attach keyboard listeners (Enter/Escape)
  useKeyboardShortcuts(mapRef, {
    onFinish: handleFinishAction,
    onCancel: handleCancelAction,
    // Enable finish (Enter) only when drawing/appending and map is available
    canFinish: (isDrawing || isAppending) && !!mapRef.current,
    // Enable cancel (Escape) when drawing, appending, or editing a selected feature
    canCancel: isDrawing || isAppending || (isEditing && !!activeFeature),
  })

  // Calculate disabled states for UI elements based on interaction state
  const showNumericInputs = isEditing && !!activeFeature
  const numericInputDisabled = !showNumericInputs || isAppending
  const startDrawingDisabled = isDrawing || isEditing || isAppending
  const editButtonDisabled =
    isDrawing || isAppending || (!isEditing && featuresCount === 0)
  const startAppendDisabled = !isEditing || isAppending || !activeFeature
  const editActionDisabled = !isEditing || isAppending || !activeFeature

  // Wrapper callback for applying numeric input from the Control Panel
  const handleApplyNumericInput = useCallback(() => {
    applyNumericInputInteraction(
      inputDistance,
      inputAngle,
      distanceUnit,
      angleUnit
    )
  }, [
    applyNumericInputInteraction,
    inputDistance,
    inputAngle,
    distanceUnit,
    angleUnit,
  ])

  // Structure props for the ControlPanel component
  const controlPanelMeasurementProps = {
    ...measurementDisplayProps,
    distanceUnit,
    angleUnit,
  }
  const controlPanelNumericInputProps = {
    inputDistance,
    inputAngle,
    handleInputChange,
    applyNumericInput: handleApplyNumericInput,
    showNumericInputs,
    numericInputDisabled,
  }
  const controlPanelDrawingProps = {
    startDrawing,
    cancelDrawing,
    isDrawing,
    startDrawingDisabled,
  }
  const controlPanelEditingProps = {
    toggleEditMode,
    isEditing,
    editButtonDisabled,
    featuresCount,
    activeFeature,
    deleteLastVertex,
    deleteEntireLine,
    editActionDisabled,
  }
  const controlPanelAppendProps = {
    startAppend,
    cancelAppend,
    isAppending,
    startAppendDisabled,
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Map Container - Needs tabIndex to be focusable for keyboard shortcuts */}
      <div
        ref={mapRef}
        tabIndex="0"
        style={{
          width: '80vw',
          height: '100%',
          outline: 'none', // Hide focus outline
          cursor:
            isDrawing || isAppending
              ? 'crosshair'
              : isEditing
                ? 'pointer'
                : 'grab',
        }}
      />
      {/* Control Panel Component */}
      <ControlPanel
        measurementProps={controlPanelMeasurementProps}
        numericInputProps={controlPanelNumericInputProps}
        drawingProps={controlPanelDrawingProps}
        editingProps={controlPanelEditingProps}
        appendProps={controlPanelAppendProps}
      />
    </div>
  )
}

export default MapComponent
