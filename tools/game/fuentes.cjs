/* Fuentes que embeben el motor y las herramientas de Node (CLI, límites, pruebas). Mismas que
   tools/build-demo.py. subset: false = embed completo (Caveat y pigpen: el subsetter rompe glifos). */
const path = require('path');
const ASSETS = path.join(__dirname, '..', '..', 'assets', 'fonts');

const FUENTES = {
  runes: { file: path.join(ASSETS, 'PigpenRunes.ttf'), subset: false },
  caveatBold: { file: path.join(ASSETS, 'Caveat-Bold.ttf'), subset: false },
  caveat: { file: path.join(ASSETS, 'Caveat-Regular.ttf'), subset: false },
  anton: { file: path.join(ASSETS, 'Anton-Regular.ttf'), subset: true },
  opensans: { file: path.join(ASSETS, 'OpenSans-Regular.ttf'), subset: true },
  opensansBold: { file: path.join(ASSETS, 'OpenSans-Bold.ttf'), subset: true },
  courier: { file: path.join(ASSETS, 'CourierPrime-Regular.ttf'), subset: true },
  courierBold: { file: path.join(ASSETS, 'CourierPrime-Bold.ttf'), subset: true },
};

module.exports = { FUENTES };
