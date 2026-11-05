# Examples

One folder per animation. Each folder holds exactly three files:

| File             | Contents                                                          |
| ---------------- | ----------------------------------------------------------------- |
| `composition.ts` | `export default defineComposition({ ... })`; `id` = folder name   |
| `config.ts`      | `export default defineExampleConfig({ stills: [...], budgetMs })` |
| `README.md`      | One line saying what the example shows                            |

The playground and the export CLI find examples by scanning `examples/*/composition.ts`.
