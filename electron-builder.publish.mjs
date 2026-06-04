/**
 * Config electron-builder untuk upload GitHub saja (--prepackaged).
 * Field di root (bukan nested "build") — spread dari package.json build + publish.
 */
import pkg from './package.json' with { type: 'json' };

const { publish: _ignored, ...buildFromPkg } = pkg.build ?? {};

export default {
  ...buildFromPkg,
  publish: {
    provider: 'github',
    owner: 'SevaIrawan',
    repo: 'bo_resource_management',
    releaseType: 'release',
  },
};
