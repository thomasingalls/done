import { AccountCore } from '../../account-service/core.ts';
import { policy } from './fixtures.mjs';
const core = new AccountCore(process.argv[2], policy);
try {
  console.log(JSON.stringify(await core.finish(JSON.parse(process.argv[3]))));
} finally {
  core.close();
}
