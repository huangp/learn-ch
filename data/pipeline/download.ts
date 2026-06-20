import { download } from './lib';

download().catch((err) => {
  console.error(err);
  process.exit(1);
});
