// Three.js materials and canvas labels consume the same CSS tokens as the UI.
export function readCityTheme() {
  const styles = getComputedStyle(document.documentElement)
  const token = name => styles.getPropertyValue(`--${name}`).trim()
  return {
    cream: token('warm-cream'), text: token('deep-walnut'), border: token('dusty-cedar'),
    background: token('warm-cream'), ground: token('city-ground'), road: token('city-road'),
    marking: token('city-marking'), roof: token('city-roof'), window: token('city-window'),
    water: token('city-water'), vegetation: token('city-vegetation'),
    waterHighlight: token('city-water-highlight'), sidewalk: token('city-sidewalk'),
    grass: token('city-grass'), bank: token('city-bank'), trunk: token('city-trunk'),
    olive: token('city-olive'), sage: token('city-sage'), terracotta: token('city-terracotta'),
    mustard: token('city-mustard'), blueGrey: token('city-blue-grey'),
    critical: token('emergency-red'), unknown: token('muted-gold'), inactive: token('route-inactive'),
    residentialAlt: token('city-residential-alt'),
    resources: { AMBULANCE: token('route-medical'), FIRE_TRUCK: token('route-fire'), RESCUE_TEAM: token('route-rescue') },
    buildings: { hospital: token('city-hospital'), factory: token('city-factory'), school: token('city-school'),
      shelter: token('city-shelter'), station: token('city-office'), residential: token('city-residential') },
  }
}
