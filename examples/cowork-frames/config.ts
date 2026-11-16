import { defineExampleConfig } from '../index.js';

/** One still per style frame (the middle of each second). */
export default defineExampleConfig({
  stills: Array.from({ length: 15 }, (_, k) => k + 0.5),
  budgetMs: 40,
});
