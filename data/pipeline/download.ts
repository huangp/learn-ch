import { download } from './lib.js';

download().catch((err) => {
  console.error(err);
  process.exit(1);
});
