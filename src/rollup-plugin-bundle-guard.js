module.exports = ({
  modules = [],
  comments = { pathPatterns: [/node_modules/], isWhitelist: false },
  strictMode = false
} = {}) => {
  const groupCommentFlag = 'rollup-plugin-bundle-guard: group=';
  const allowedImportFromCommentFlag =
    'rollup-plugin-bundle-guard: allowedImportFrom=';
  const defaultGroupName = 'default';
  const moduleIdToGroup = new Map();
  const moduleIdToAllowedImporters = new Map();
  const modulesCheckedConfig = new Set();

  function addModuleIdToGroup(context, moduleId, groupName) {
    const group = moduleIdToGroup.get(moduleId);
    if (group && group !== groupName) {
      context.error(
        `"${moduleId}" is already assigned to group "${group}". It cannot also be assigned to group "${groupName}".`
      );
    }
    moduleIdToGroup.set(moduleId, groupName);
  }

  function addModuleIdToAllowedImporters(moduleId, groupName) {
    const allowedImporters =
      moduleIdToAllowedImporters.get(moduleId) || new Set();
    if (groupName) {
      allowedImporters.add(groupName);
    }
    moduleIdToAllowedImporters.set(moduleId, allowedImporters);
  }

  async function moduleIdMatches(context, candidateModuleId, moduleIdOrRegex) {
    if (moduleIdOrRegex instanceof RegExp) {
      return moduleIdOrRegex.test(candidateModuleId);
    } else {
      const resolved = await context.resolve(moduleIdOrRegex, '');
      const itemModuleId = resolved && resolved.id;
      return itemModuleId === candidateModuleId;
    }
  }

  async function processConfig(context, moduleId) {
    if (!modulesCheckedConfig.has(moduleId)) {
      modulesCheckedConfig.add(moduleId);
      for (let i = 0; i < modules.length; i++) {
        const { module: moduleName, allowedImportFrom, group } = modules[i];
        if (!moduleName) {
          context.error(new Error(`'module' required.`));
        }
        if (await moduleIdMatches(context, moduleId, moduleName)) {
          if (!strictMode || group) {
            addModuleIdToGroup(context, moduleId, group || defaultGroupName);
          }
          if (allowedImportFrom) {
            // an empty array of allowed importers should clear the `default` group
            addModuleIdToAllowedImporters(moduleId, null);
            allowedImportFrom.forEach(allowedImportFromGroup => {
              addModuleIdToAllowedImporters(moduleId, allowedImportFromGroup);
            });
          }
        }
      }
    }
  }

  async function getModuleGroup(context, moduleId) {
    await processConfig(context, moduleId);
    return moduleIdToGroup.has(moduleId)
      ? moduleIdToGroup.get(moduleId)
      : strictMode
      ? null
      : defaultGroupName;
  }

  async function getModuleAllowedImporters(context, moduleId) {
    await processConfig(context, moduleId);
    const moduleGroup = await getModuleGroup(context, moduleId);
    const allowedImporters = [
      ...(moduleIdToAllowedImporters.get(moduleId) ||
        new Set([!strictMode && defaultGroupName].filter(Boolean)))
    ];
    return [...new Set([moduleGroup, ...allowedImporters].filter(Boolean))];
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

      this.parse(code, {
        onComment: (_block, text) => {
          const trimmed = text.trim();
          if (trimmed.startsWith(groupCommentFlag)) {
            const groupName = trimmed.substr(groupCommentFlag.length);
            addModuleIdToGroup(this, moduleId, groupName);
          } else if (trimmed.startsWith(allowedImportFromCommentFlag)) {
            const groupNames = trimmed
              .substr(allowedImportFromCommentFlag.length)
              .split(' ');
            groupNames.forEach(groupName => {
              addModuleIdToAllowedImporters(moduleId, groupName);
            });
          }
        }
      });
    },

    async generateBundle(_, bundle) {
      for (const fileName in bundle) {
        if (bundle[fileName].type && bundle[fileName].type !== 'chunk') {
          continue;
        }

        for (const currentModule in bundle[fileName].modules) {
          const currentModuleGroup = await getModuleGroup(this, currentModule);
          const moduleInfo = this.getModuleInfo(currentModule);
          for (let i = 0; i < moduleInfo.importedIds.length; i++) {
            const importedModule = moduleInfo.importedIds[i];
            const importedModuleAllowedImporters = await getModuleAllowedImporters(
              this,
              importedModule
            );
            if (!importedModuleAllowedImporters.length) {
              this.error(
                new Error(
                  `"${importedModule}" is not assigned a group, which is required when strict mode is enabled.`
                )
              );
            } else if (
              !importedModuleAllowedImporters.includes(currentModuleGroup)
            ) {
              this.error(
                new Error(
                  `"${currentModule}" statically imports "${importedModule}" which is not allowed. Should it be in ${
                    importedModuleAllowedImporters.length > 1 ? 'one of ' : ''
                  }"${importedModuleAllowedImporters.join('", "')}"?`
                )
              );
            }
          }
        }
      }
    }
  };
};
