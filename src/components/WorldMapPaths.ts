// Simplified continent silhouettes drawn on a 1000×500 equirectangular
// projection (longitude −180..180 → x 0..1000, latitude 90..−90 → y 0..500).
// These are deliberately coarse — recognizable shape, low byte count, no
// dependency on a topojson dataset. Drawn so the relative position of any
// city plotted via project(lng, lat) lands on the correct landmass.
//
// If you ever need country-level resolution, swap this for a full
// natural-earth-vector dataset and a real path generator (d3-geo); this
// file is just enough to make the destination dots look like they belong
// to actual continents.

export const CONTINENT_PATHS = [
  // North America — bounded by Alaska (left), Greenland (top), Florida (south).
  // x range ~30..330, y range ~70..280.
  'M 35 110 L 80 80 L 140 70 L 200 75 L 250 90 L 290 100 L 310 130 L 320 170 L 305 210 L 280 240 L 250 265 L 215 270 L 185 260 L 155 240 L 130 220 L 110 195 L 90 175 L 75 155 L 60 135 Z',
  // Central America / Mexico tail
  'M 230 270 L 260 285 L 285 305 L 300 320 L 285 325 L 260 320 L 240 305 L 225 290 Z',
  // South America
  'M 290 320 L 330 305 L 360 330 L 375 365 L 380 405 L 370 445 L 350 470 L 325 475 L 310 460 L 300 425 L 295 385 L 290 350 Z',
  // Europe — UK + mainland.
  'M 460 95 L 490 85 L 520 90 L 550 100 L 580 115 L 590 140 L 580 170 L 555 185 L 525 190 L 490 185 L 470 170 L 460 145 L 458 120 Z',
  // Africa — distinctive bulge west, taper south.
  'M 470 195 L 510 185 L 555 195 L 580 215 L 590 250 L 585 290 L 575 325 L 560 360 L 540 395 L 520 415 L 500 395 L 485 360 L 475 320 L 470 280 L 472 240 Z',
  // Middle East + Asia
  'M 590 130 L 640 110 L 700 100 L 760 105 L 820 115 L 870 130 L 905 150 L 920 180 L 905 215 L 880 245 L 845 270 L 805 290 L 770 295 L 735 285 L 705 270 L 680 250 L 660 230 L 640 205 L 620 180 L 605 155 Z',
  // India peninsula
  'M 720 260 L 745 270 L 760 290 L 755 320 L 735 335 L 715 320 L 705 290 Z',
  // SE Asia islands hint
  'M 820 305 L 855 310 L 885 320 L 895 340 L 870 345 L 840 340 L 815 325 Z',
  // Australia / Oceania
  'M 855 380 L 905 375 L 940 385 L 950 410 L 935 430 L 905 440 L 875 435 L 855 420 L 850 400 Z',
];
