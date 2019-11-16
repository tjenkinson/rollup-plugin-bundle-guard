const rollup = require('rollup');
const rollupPluginImportGuard = require('./rollup-plugin-import-guard');

const entryFile = 'entry.js';

function buildFakeFile(id, contents) {
  return {
    resolveId(_id) {
      if (_id === id) {
        return { id };
      }
      return null;
    },
    load(_id) {
      if (_id === id) {
        return contents;
      }
      return null;
    }
  };
}

async function doBuild({ config, files, external }) {
  const bundle = await rollup.rollup({
    external,
    input: entryFile,
    onwarn: e => {
      throw new Error(e);
    },
    plugins: [
      rollupPluginImportGuard(config),
      ...Object.keys(files).map(fileName =>
        buildFakeFile(
          fileName,
          files[fileName] + `\nconsole.log("${fileName}")`
        )
      )
    ]
  });
  return bundle.generate({ format: 'cjs' });
}

describe('RollupPluginImportGuard', () => {
  it('case 1', async () => {
    await doBuild({
      config: undefined,
      files: {
        [entryFile]: `
          import 'a';
          import 'b';

          import('b');
          import('c');
        `,
        a: ``,
        b: ``,
        c: `import 'd';`,
        d: ``
      }
    });
  });

  it('case 2', async () => {
    await expect(
      doBuild({
        config: { strictMode: true },
        files: {
          [entryFile]: `
            import 'a';
            import 'b';

            import('b');
            import('c');
          `,
          a: ``,
          b: ``,
          c: `import 'd';`,
          d: ``
        }
      })
    ).rejects.toMatchObject({
      message:
        '"a" is not assigned a group, which is required when strict mode is enabled.'
    });
  });

  it('case 3', async () => {
    await doBuild({
      config: undefined,
      files: {
        [entryFile]: `
          // rollup-plugin-import-guard: group=entry

          import 'a';
          import 'b';

          import('b');
          import('c');
        `,
        a: ``,
        b: `// rollup-plugin-import-guard: group=group1 entry`,
        c: `
          // rollup-plugin-import-guard: group=group2 group3
          import 'd';`,
        d: `// rollup-plugin-import-guard: group=group3`
      }
    });
  });

  it('case 4', async () => {
    await expect(
      doBuild({
        config: undefined,
        files: {
          [entryFile]: `
            // rollup-plugin-import-guard: group=entry

            import 'a';
            import 'b';

            import('b');
            import('c');
          `,
          a: ``,
          b: `// rollup-plugin-import-guard: group=group1`,
          c: `
        // rollup-plugin-import-guard: group=group2
        import 'd';`,
          d: `// rollup-plugin-import-guard: group=group3`
        }
      })
    ).rejects.toMatchObject({
      message:
        '"entry.js" statically imports "b" which is not allowed because it is not in the same group. Should it be in "group1"?'
    });
  });

  it('case 5', async () => {
    await expect(
      doBuild({
        config: {
          groups: {
            group4: ['some-external']
          },
          strictMode: true
        },
        external: ['some-external'],
        files: {
          [entryFile]: `
            // rollup-plugin-import-guard: group=entry

            import 'some-external';
          `
        }
      })
    ).rejects.toMatchObject({
      message:
        '"entry.js" statically imports "some-external" which is not allowed because it is not in the same group. Should it be in "group4"?'
    });
  });

  it('case 6', async () => {
    await expect(
      doBuild({
        config: {
          strictMode: true
        },
        files: {
          [entryFile]: `
            // rollup-plugin-import-guard: group=entry

            import 'node_modules/something';
          `,
          'node_modules/something': `
            // rollup-plugin-import-guard: group=entry
          `
        }
      })
    ).rejects.toMatchObject({
      message:
        '"node_modules/something" is not assigned a group, which is required when strict mode is enabled.'
    });
  });

  it('case 7', async () => {
    await doBuild({
      config: {
        strictMode: true,
        comments: {}
      },
      files: {
        [entryFile]: `
          // rollup-plugin-import-guard: group=entry

          import 'node_modules/something';
        `,
        'node_modules/something': `
          // rollup-plugin-import-guard: group=entry
        `
      }
    });
  });

  it('case 8', async () => {
    await doBuild({
      config: {
        groups: {
          entry: ['node_modules/something']
        },
        strictMode: true
      },
      files: {
        [entryFile]: `
          // rollup-plugin-import-guard: group=entry

          import 'node_modules/something';
        `,
        'node_modules/something': ``
      }
    });
  });

  it('case 9', async () => {
    await expect(
      doBuild({
        config: {
          comments: { isWhitelist: true },
          strictMode: true
        },
        files: {
          [entryFile]: `
            import 'a';
          `,
          a: `
            // rollup-plugin-import-guard: group=entry
          `
        }
      })
    ).rejects.toMatchObject({
      message:
        '"a" is not assigned a group, which is required when strict mode is enabled.'
    });
  });

  it('case 10', async () => {
    await doBuild({
      config: {
        strictMode: true
      },
      files: {
        [entryFile]: `
          // rollup-plugin-import-guard: group=entry
          import 'a';
          import('b');
        `,
        a: `
          // rollup-plugin-import-guard: group=entry
        `,
        b: ``
      }
    });
  });

  it('case 11', async () => {
    await expect(
      doBuild({
        config: {
          strictMode: true
        },
        files: {
          [entryFile]: `
            // rollup-plugin-import-guard: group=entry
            import 'a';
            import('b');
          `,
          a: `
            // rollup-plugin-import-guard: group=entry
          `,
          b: `
            import 'a'
          `
        }
      })
    ).rejects.toMatchObject({
      message:
        '"b" statically imports "a" which is not allowed because it is not in the same group. Should it be in "entry"?'
    });
  });

  it('case 12', async () => {
    await expect(
      doBuild({
        config: {
          strictMode: false
        },
        files: {
          [entryFile]: `
            // rollup-plugin-import-guard: group=entry
            import 'a';
            import('b');
          `,
          a: `
            // rollup-plugin-import-guard: group=entry
          `,
          b: `
            import 'a'
          `
        }
      })
    ).rejects.toMatchObject({
      message:
        '"b" statically imports "a" which is not allowed because it is not in the same group. Should it be in "entry"?'
    });
  });
});
