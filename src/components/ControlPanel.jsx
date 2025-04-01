import React from 'react'

const ControlPanel = ({
  measurementProps,
  numericInputProps,
  drawingProps,
  editingProps,
  appendProps,
}) => {
  const {
    displayDistance,
    displayAzimuth,
    displayHoveredAngle,
    toggleDistanceUnit,
    toggleAngleUnit,
    toggleHoveredAngleUnit,
    distanceUnit,
    angleUnit,
    hoveredAngleUnit,
  } = measurementProps

  const {
    inputDistance,
    inputAngle,
    handleInputChange,
    applyNumericInput,
    showNumericInputs,
    numericInputDisabled,
  } = numericInputProps

  const { startDrawing, cancelDrawing, isDrawing, startDrawingDisabled } =
    drawingProps

  const {
    toggleEditMode,
    isEditing,
    editButtonDisabled,
    featuresCount,
    activeFeature,
    deleteLastVertex,
    deleteEntireLine,
    editActionDisabled,
  } = editingProps

  const { startAppend, cancelAppend, isAppending, startAppendDisabled } =
    appendProps

  return (
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
          <span>Distance: {displayDistance}</span>
          <button
            onClick={toggleDistanceUnit}
            style={{ padding: '2px 5px', cursor: 'pointer', fontSize: '0.8em' }}
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
          <span>Azimuth: {displayAzimuth}</span>
          <button
            onClick={toggleAngleUnit}
            style={{ padding: '2px 5px', cursor: 'pointer', fontSize: '0.8em' }}
            title={`Switch to ${angleUnit === 'deg' ? 'radians' : 'degrees'}`}
          >
            {angleUnit === 'deg' ? 'Use rad' : 'Use deg'}
          </button>
        </div>
      </div>

      {/* Hovered Angle Display */}
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
          <span>Angle: {displayHoveredAngle}</span>
          <button
            onClick={toggleHoveredAngleUnit}
            style={{ padding: '2px 5px', cursor: 'pointer', fontSize: '0.8em' }}
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
          <small style={{ display: 'block', marginTop: '4px', color: '#666' }}>
            Select line in Edit Mode.
          </small>
        )}
        {showNumericInputs && (
          <small style={{ display: 'block', marginTop: '4px', color: 'blue' }}>
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
          <small style={{ display: 'block', marginTop: '4px', color: '#666' }}>
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
              {/* Append Controls */}
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
              {/* General Edit Actions */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
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
  )
}

export default ControlPanel
