const rollup = require('rollup');
const RollupPluginBundleGuard = require('./rollup-plugin-bundle-guard');

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
      RollupPluginBundleGuard(config),
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

describe('RollupPluginBundleGuard', () => {
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
          import 'a';
          import 'b';

          import('b');
          import('c');
        `,
        a: ``,
        b: `// rollup-plugin-bundle-guard: allowedImportFrom=group1`,
        c: `
          // rollup-plugin-bundle-guard: group=group1
          import 'd';`,
        d: `
          // rollup-plugin-bundle-guard: group=group1
          import 'b';
        `
      }
    });
  });

  it('case 4', async () => {
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
        b: `
          // rollup-plugin-bundle-guard: group=group1
          // rollup-plugin-bundle-guard: allowedImportFrom=default
        `,
        c: `
          // rollup-plugin-bundle-guard: group=group2
          import 'd';`,
        d: `
          // rollup-plugin-bundle-guard: group=group3
          // rollup-plugin-bundle-guard: allowedImportFrom=group2
        `
      }
    });
  });

  it('case 5', async () => {
    await expect(
      doBuild({
        config: {
          modules: [
            {
              module: 'some-external',
              group: 'group4'
            }
          ],
          strictMode: true
        },
        external: ['some-external'],
        files: {
          [entryFile]: `
            // rollup-plugin-bundle-guard: group=entry

            import 'some-external';
          `
        }
      })
    ).rejects.toMatchObject({
      message:
        '"entry.js" statically imports "some-external" which is not allowed. Should it be in "group4"?'
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
            // rollup-plugin-bundle-guard: group=entry

            import 'node_modules/something';
          `,
          'node_modules/something': `
            // rollup-plugin-bundle-guard: group=entry
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
          // rollup-plugin-bundle-guard: group=entry

          import 'node_modules/something';
        `,
        'node_modules/something': `
          // rollup-plugin-bundle-guard: group=entry
        `
      }
    });
  });

  it('case 8', async () => {
    await doBuild({
      config: {
        modules: [{ module: 'node_modules/something', group: 'entry' }],
        strictMode: true
      },
      files: {
        [entryFile]: `
          // rollup-plugin-bundle-guard: group=entry

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
            // rollup-plugin-bundle-guard: group=entry
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
          // rollup-plugin-bundle-guard: group=entry
          import 'a';
          import('b');
        `,
        a: `
          // rollup-plugin-bundle-guard: group=entry
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
            // rollup-plugin-bundle-guard: group=entry
            import 'a';
            import('b');
          `,
          a: `
            // rollup-plugin-bundle-guard: group=entry
          `,
          b: `
            import 'a'
          `
        }
      })
    ).rejects.toMatchObject({
      message:
        '"b" statically imports "a" which is not allowed. Should it be in "entry"?'
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
            // rollup-plugin-bundle-guard: group=entry
            import 'a';
            import('b');
          `,
          a: `
            // rollup-plugin-bundle-guard: group=entry
          `,
          b: `
            // rollup-plugin-bundle-guard: group=group2
            import 'a'
          `
        }
      })
    ).rejects.toMatchObject({
      message:
        '"b" statically imports "a" which is not allowed. Should it be in one of "entry", "default"?'
    });
  });

  it('case 13', async () => {
    await expect(
      doBuild({
        config: {
          modules: [{ module: 'a', group: 'group1', allowedImportFrom: [] }]
        },
        files: {
          [entryFile]: `
            import 'a';
          `,
          a: ``
        }
      })
    ).rejects.toMatchObject({
      message:
        '"entry.js" statically imports "a" which is not allowed. Should it be in "group1"?'
    });
  });

  it('case 14', async () => {
    await doBuild({
      config: {
        modules: [{ module: 'a', group: 'group1' }]
      },
      files: {
        [entryFile]: `
            import 'a';
          `,
        a: ``
      }
    });
  });

  it('case 15', async () => {
    await doBuild({
      config: {
        modules: [
          { module: entryFile, group: 'group1' },
          {
            module: 'a',
            allowedImportFrom: ['group1']
          }
        ]
      },
      files: {
        [entryFile]: `
          import 'a';
        `,
        a: ``
      }
    });
  });

  it('case 16', async () => {
    await doBuild({
      config: {
        modules: [
          {
            module: 'a',
            allowedImportFrom: ['default'],
            group: 'group1'
          }
        ]
      },
      files: {
        [entryFile]: `
          import 'a';
        `,
        a: ``
      }
    });
  });

  it('case 17', async () => {
    await expect(
      doBuild({
        config: {
          modules: [
            {
              module: entryFile,
              group: 'group1'
            }
          ]
        },
        files: {
          [entryFile]: `
            // rollup-plugin-bundle-guard: group=entry
          `
        }
      })
    ).rejects.toMatchObject({
      message:
        '"entry.js" is already assigned to group "entry". It cannot also be assigned to group "group1".'
    });
  });

  it('case 18', async () => {
    await doBuild({
      config: {
        modules: [
          {
            module: 'b',
            allowedImportFrom: ['group2']
          }
        ]
      },
      files: {
        [entryFile]: `
          // rollup-plugin-bundle-guard: group=group1
          import('a');
          import 'b';
        `,
        a: `
          // rollup-plugin-bundle-guard: group=group2
          import 'b';
        `,
        b: `
          // rollup-plugin-bundle-guard: allowedImportFrom=group1
        `
      }
    });
  });

  it('case 19', async () => {
    await doBuild({
      config: undefined,
      files: {
        [entryFile]: `
          import 'a';
          import('b');
        `,
        a: `
          // rollup-plugin-bundle-guard: allowedImportFrom=group1 entry
        `,
        b: `
          // rollup-plugin-bundle-guard: group=group1
          import 'a';
        `
      }
    });
  });

  it('case 20', async () => {
    await expect(
      doBuild({
        config: {
          modules: [{}]
        },
        files: {
          [entryFile]: ``
        }
      })
    ).rejects.toMatchObject({
      message: `'module' required.`
    });
  });

  it('case 21', async () => {
    await expect(
      doBuild({
        config: undefined,
        files: {
          [entryFile]: `
            import 'a';
          `,
          a: `
            // rollup-plugin-bundle-guard: group=group1
            // rollup-plugin-bundle-guard: allowedImportFrom=
          `
        }
      })
    ).rejects.toMatchObject({
      message:
        '"entry.js" statically imports "a" which is not allowed. Should it be in "group1"?'
    });
  });

  it('case 22', async () => {
    await expect(
      doBuild({
        config: undefined,
        files: {
          [entryFile]: `
            // rollup-plugin-bundle-guard: group=
          `
        }
      })
    ).rejects.toMatchObject({
      message: `Group name must not be empty.`
    });
  });

  it('case 23', async () => {
    await doBuild({
      config: {
        strictMode: true,
        modules: [
          {
            module: [entryFile, 'a'],
            group: 'group1'
          }
        ]
      },
      files: {
        [entryFile]: `import 'a';`,
        a: ``
      }
    });
  });
});
