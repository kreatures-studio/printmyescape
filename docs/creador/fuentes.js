// Fuentes del motor en el navegador (mismas que tools/game/fuentes.cjs, con rutas relativas al editor).
// subset: false = incrustar completa (la pintura de las runas y los manuscritos no soporta subconjuntos).
export const FUENTES = {
  runes: { file: './assets/fonts/PigpenRunes.ttf', subset: false },
  caveatBold: { file: './assets/fonts/Caveat-Bold.ttf', subset: false },
  caveat: { file: './assets/fonts/Caveat-Regular.ttf', subset: false },
  anton: { file: './assets/fonts/Anton-Regular.ttf', subset: true },
  opensans: { file: './assets/fonts/OpenSans-Regular.ttf', subset: true },
  opensansBold: { file: './assets/fonts/OpenSans-Bold.ttf', subset: true },
  courier: { file: './assets/fonts/CourierPrime-Regular.ttf', subset: true },
  courierBold: { file: './assets/fonts/CourierPrime-Bold.ttf', subset: true },
};
