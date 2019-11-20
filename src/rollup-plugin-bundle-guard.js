module.exports = ({
  groups = {},
  comments = { pathPatterns: [/node_modules/], isWhitelist: false },
  strictMode = false
} = {}) => {
  const commentFlag = 'rollup-plugin-bundle-guard: group=';
  const moduleIdToGroups = new Map();
  const modulesCheckedConfig = new Set();

  function addModuleIdToGroup(moduleId, groupName) {
    const groups = moduleIdToGroups.get(moduleId) || new Set();
    groups.add(groupName);
    moduleIdToGroups.set(moduleId, groups);
  }

  async function getModuleGroups(context, moduleId) {
    if (!modulesCheckedConfig.has(moduleId)) {
      modulesCheckedConfig.add(moduleId);
      for (const groupName in groups) {
        for (let i = 0; i < groups[groupName].length; i++) {
          const item = groups[groupName][i];
          if (item instanceof RegExp) {
            if (item.test(moduleId)) {
              addModuleIdToGroup(moduleId, groupName);
            }
          } else {
            const resolved = await context.resolve(item, process.cwd());
            const itemModuleId = resolved && resolved.id;
            if (itemModuleId === moduleId) {
              addModuleIdToGroup(moduleId, groupName);
            }
          }
        }
      }
    }
    return moduleIdToGroups.has(moduleId)
      ? Array.from(moduleIdToGroups.get(moduleId))
      : [];
  }

  return {
    name: 'rollup-plugin-bundle-guard',

    transform(code, moduleId) {
      const match = (comments.pathPatterns || []).some(pattern =>
        pattern.test(moduleId)
      );
      if (match === !comments.isWhitelist) {
        return;
      }

      const ast = this.parse(code, {
        onComment: (_block, text) => {
          const trimmed = text.trim();
          if (trimmed.startsWith(commentFlag)) {
            const groupNames = trimmed.substr(commentFlag.length);
            groupNames
              .split(' ')
              .forEach(groupName => addModuleIdToGroup(moduleId, groupName));
          }
        }
      });
      return { code, ast };
    },

    async generateBundle(_, bundle) {
      for (const fileName in bundle) {
        if (bundle[fileName].type !== 'chunk') {
          continue;
        }

        for (const currentModule in bundle[fileName].modules) {
          const currentModuleGroups = await getModuleGroups(
            this,
            currentModule
          );
          const moduleInfo = this.getModuleInfo(currentModule);
          for (let i = 0; i < moduleInfo.importedIds.length; i++) {
            const importedModule = moduleInfo.importedIds[i];
            const importedModuleGroups = await getModuleGroups(
              this,
              importedModule
            );
            if (strictMode && !importedModuleGroups.length) {
              this.error(
                new Error(
                  `"${importedModule}" is not assigned a group, which is required when strict mode is enabled.`
                )
              );
            } else if (
              importedModuleGroups.length &&
              !importedModuleGroups.some(group =>
                currentModuleGroups.includes(group)
              )
            ) {
              this.error(
                new Error(
                  `"${currentModule}" statically imports "${importedModule}" which is not allowed because it is not in the same group. Should it be in ${
                    importedModuleGroups.length > 1 ? 'one of ' : ''
                  }"${importedModuleGroups.join('", "')}"?`
                )
              );
            }
          }
        }
      }
    }
  };
};
