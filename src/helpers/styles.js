import { Style, Stroke, Circle as CircleStyle, Fill } from 'ol/style'

export const finalizedStyle = new Style({
  stroke: new Stroke({ color: 'rgba(0, 0, 255, 1)', width: 3 }),
  image: new CircleStyle({
    radius: 4,
    fill: new Fill({ color: 'rgba(0, 0, 255, 1)' }),
  }),
})

export const drawingStyle = new Style({
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

export const selectedStyle = new Style({
  stroke: new Stroke({ color: 'rgba(255, 0, 0, 0.8)', width: 4 }),
  image: new CircleStyle({
    radius: 6,
    fill: new Fill({ color: 'rgba(255, 0, 0, 0.8)' }),
  }),
})

export const modifyVertexStyle = new Style({
  image: new CircleStyle({
    radius: 6,
    fill: new Fill({ color: 'orange' }),
    stroke: new Stroke({ color: 'white', width: 2 }),
  }),
})

// Layer style function needs access to state/refs, so it's better defined
// within a hook or component that has that access.
// We export the static styles here.
