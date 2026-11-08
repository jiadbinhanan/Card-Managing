const fs = require('fs');
const path = require('path');
const os = require('os');
const child_process = require('child_process');

function patchAarFile(aarPath) {
  try {
    if (process.platform === 'win32') {
      const escapedAar = aarPath.replace(/'/g, "''");
      const psCommand = `Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip = [System.IO.Compression.ZipFile]::Open('${escapedAar}', [System.IO.Compression.ZipArchiveMode]::Update); $e = $zip.Entries | Where-Object { $_.FullName -like '*graphicsConversions.h*' }; if ($e) { $r = New-Object System.IO.StreamReader($e.Open()); $c = $r.ReadToEnd(); $r.Close(); if ($c.Contains('std::format')) { $nc = $c.Replace('return std::format("{}%", dimension.value);', 'return std::to_string(dimension.value) + "%";'); $fn = $e.FullName; $e.Delete(); $ne = $zip.CreateEntry($fn); $w = New-Object System.IO.StreamWriter($ne.Open()); $w.Write($nc); $w.Close(); Write-Output 'AAR_PATCHED' } }; $zip.Dispose()`;
      const out = child_process.execSync(`powershell -NoProfile -Command "${psCommand}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      if (out && out.includes('AAR_PATCHED')) {
        console.log('[patch-rn-cpp] Patched graphicsConversions.h inside AAR:', aarPath);
      }
    } else {
      const tmpDir = path.join(os.tmpdir(), 'aar_patch_' + Date.now());
      fs.mkdirSync(tmpDir, { recursive: true });
      try {
        child_process.execSync(`unzip -q -o "${aarPath}" "prefab/modules/reactnative/include/react/renderer/core/graphicsConversions.h" -d "${tmpDir}"`, { stdio: 'ignore' });
        const extracted = path.join(tmpDir, 'prefab/modules/reactnative/include/react/renderer/core/graphicsConversions.h');
        if (fs.existsSync(extracted)) {
          let content = fs.readFileSync(extracted, 'utf8');
          if (content.includes('std::format')) {
            content = content.replace('return std::format("{}%", dimension.value);', 'return std::to_string(dimension.value) + "%";');
            fs.writeFileSync(extracted, content, 'utf8');
            child_process.execSync(`cd "${tmpDir}" && zip -u "${aarPath}" "prefab/modules/reactnative/include/react/renderer/core/graphicsConversions.h"`, { stdio: 'ignore' });
            console.log('[patch-rn-cpp] Patched graphicsConversions.h inside AAR on Linux:', aarPath);
          }
        }
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  } catch (err) {
    // Non-fatal if AAR is locked or in use
  }
}

function findTransformPath() {
  const baseTransforms = path.join(os.homedir(), '.gradle', 'caches');
  if (!fs.existsSync(baseTransforms)) return '';
  
  // Search only in .gradle/caches/*/transforms
  try {
    for (const v of fs.readdirSync(baseTransforms)) {
      const tDir = path.join(baseTransforms, v, 'transforms');
      if (fs.existsSync(tDir)) {
        for (const t of fs.readdirSync(tDir)) {
          const transformedDir = path.join(tDir, t, 'transformed');
          if (fs.existsSync(transformedDir)) {
            for (const cand of fs.readdirSync(transformedDir)) {
              if (cand.startsWith('react-android-0.86.3')) {
                return path.join(transformedDir, cand).replace(/\\/g, '/');
              }
            }
          }
        }
      }
    }
  } catch (e) {}
  return '';
}

const cachedTransformPath = findTransformPath();

function provisionReactAndroidConfig(targetCmakeDir, abiName) {
  const reactAndroidDir = path.join(targetCmakeDir, 'ReactAndroid');
  if (fs.existsSync(reactAndroidDir)) return;
  if (!cachedTransformPath) return;

  fs.mkdirSync(reactAndroidDir, { recursive: true });
  const configPath = path.join(reactAndroidDir, 'ReactAndroidConfig.cmake');
  const versionPath = path.join(reactAndroidDir, 'ReactAndroidConfigVersion.cmake');
  
  fs.writeFileSync(configPath, `if(NOT TARGET ReactAndroid::hermestooling)
add_library(ReactAndroid::hermestooling SHARED IMPORTED)
set_target_properties(ReactAndroid::hermestooling PROPERTIES
    IMPORTED_LOCATION "${cachedTransformPath}/prefab/modules/hermestooling/libs/android.${abiName}/libhermestooling.so"
    INTERFACE_INCLUDE_DIRECTORIES "${cachedTransformPath}/prefab/modules/hermestooling/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

if(NOT TARGET ReactAndroid::jsi)
add_library(ReactAndroid::jsi SHARED IMPORTED)
set_target_properties(ReactAndroid::jsi PROPERTIES
    IMPORTED_LOCATION "${cachedTransformPath}/prefab/modules/jsi/libs/android.${abiName}/libjsi.so"
    INTERFACE_INCLUDE_DIRECTORIES "${cachedTransformPath}/prefab/modules/jsi/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

if(NOT TARGET ReactAndroid::reactnative)
add_library(ReactAndroid::reactnative SHARED IMPORTED)
set_target_properties(ReactAndroid::reactnative PROPERTIES
    IMPORTED_LOCATION "${cachedTransformPath}/prefab/modules/reactnative/libs/android.${abiName}/libreactnative.so"
    INTERFACE_INCLUDE_DIRECTORIES "${cachedTransformPath}/prefab/modules/reactnative/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()
`, 'utf8');

  fs.writeFileSync(versionPath, `set(PACKAGE_VERSION 0.86.3)
if("\${PACKAGE_VERSION}" VERSION_LESS "\${PACKAGE_FIND_VERSION}")
    set(PACKAGE_VERSION_COMPATIBLE FALSE)
else()
    set(PACKAGE_VERSION_COMPATIBLE TRUE)
    if("\${PACKAGE_VERSION}" VERSION_EQUAL "\${PACKAGE_FIND_VERSION}")
        set(PACKAGE_VERSION_EXACT TRUE)
    endif()
endif()
`, 'utf8');
  console.log('[patch-rn-cpp] Provisioned ReactAndroidConfig in:', reactAndroidDir, 'for', abiName);
}

function patchGraphicsHeader(headerPath) {
  if (!fs.existsSync(headerPath)) return;
  try {
    let content = fs.readFileSync(headerPath, 'utf8');
    if (content.includes('std::format')) {
      content = content.replace(
        'return std::format("{}%", dimension.value);',
        'return std::to_string(dimension.value) + "%";'
      );
      fs.writeFileSync(headerPath, content, 'utf8');
      console.log('[patch-rn-cpp] Successfully patched graphicsConversions.h:', headerPath);
    }
  } catch (e) {}
}

function patchReanimatedInterpolator(nodeModulesDir) {
  const reanimatedDir = path.join(nodeModulesDir, 'react-native-reanimated', 'Common', 'cpp', 'reanimated', 'LayoutAnimations');
  if (!fs.existsSync(reanimatedDir)) return;

  const cppFile = path.join(reanimatedDir, 'TransformOperationInterpolator.cpp');
  if (fs.existsSync(cppFile)) {
    let content = fs.readFileSync(cppFile, 'utf8');
    if (content.includes('// Specialization for resolvable operations')) {
      content = content.replace(
        /\/\/ Specialization for resolvable operations[\s\S]*?\/\/ Rotate operations/,
        '// Rotate operations'
      );
      fs.writeFileSync(cppFile, content, 'utf8');
      console.log('[patch-rn-cpp] Patched TransformOperationInterpolator.cpp');
    }
  }

  const hFile = path.join(reanimatedDir, 'TransformOperationInterpolator.h');
  if (fs.existsSync(hFile)) {
    let content = fs.readFileSync(hFile, 'utf8');
    if (!content.includes('fromOp.value.interpolate')) {
      const oldBlock = `  std::unique_ptr<StyleOperation> interpolate(
      double progress,
      const std::shared_ptr<StyleOperation> &from,
      const std::shared_ptr<StyleOperation> &to,
      const StyleOperationsInterpolationContext &context) const override;

  std::shared_ptr<StyleOperation> resolveOperation(
      const std::shared_ptr<StyleOperation> &operation,
      const StyleOperationsInterpolationContext &context) const override;

 protected:
  const ResolvableValueInterpolatorConfig config_;

  ResolvableValueInterpolationContext getResolvableValueContext(
      const StyleOperationsInterpolationContext &context) const;
};`;
      const newBlock = `  std::unique_ptr<StyleOperation> interpolate(
      double progress,
      const std::shared_ptr<StyleOperation> &from,
      const std::shared_ptr<StyleOperation> &to,
      const StyleOperationsInterpolationContext &context) const override {
    const auto &fromOp = *std::static_pointer_cast<TOperation>(from);
    const auto &toOp = *std::static_pointer_cast<TOperation>(to);

    return std::make_unique<TOperation>(
        fromOp.value.interpolate(progress, toOp.value, getResolvableValueContext(context)));
  }

  std::shared_ptr<StyleOperation> resolveOperation(
      const std::shared_ptr<StyleOperation> &operation,
      const StyleOperationsInterpolationContext &context) const override {
    const auto &resolvableOp = std::static_pointer_cast<TOperation>(operation);
    const auto &resolved = resolvableOp->value.resolve(getResolvableValueContext(context));

    if (!resolved.has_value()) {
      throw std::invalid_argument(
          "[Reanimated] Cannot resolve resolvable operation: " + operation->getOperationName() +
          " for node with tag: " + std::to_string(context.node->getTag()));
    }

    return std::make_shared<TOperation>(resolved.value());
  }

 protected:
  const ResolvableValueInterpolatorConfig config_;

  ResolvableValueInterpolationContext getResolvableValueContext(
      const StyleOperationsInterpolationContext &context) const {
    return ResolvableValueInterpolationContext{
        .node = context.node,
        .fallbackInterpolateThreshold = context.fallbackInterpolateThreshold,
        .viewStylesRepository = context.viewStylesRepository,
        .relativeProperty = config_.relativeProperty,
        .relativeTo = config_.relativeTo};
  }
};`;
      if (content.includes(oldBlock)) {
        content = content.replace(oldBlock, newBlock);
        fs.writeFileSync(hFile, content, 'utf8');
        console.log('[patch-rn-cpp] Patched TransformOperationInterpolator.h');
      }
    }
  }
}

function patchSubprojectBuildGradles(nodeModulesDir) {
  const pkgs = [
    '@react-native-async-storage/async-storage',
    '@react-native-community/netinfo',
    '@react-native-masked-view/masked-view',
    'react-native-gesture-handler',
    'react-native-mmkv',
    'react-native-nitro-modules',
    'react-native-safe-area-context',
    'react-native-screens',
    'react-native-svg',
    'react-native-worklets'
  ];

  for (const pkg of pkgs) {
    const bgPath = path.join(nodeModulesDir, ...pkg.split('/'), 'android', 'build.gradle');
    if (fs.existsSync(bgPath)) {
      try {
        let content = fs.readFileSync(bgPath, 'utf8');
        if (content.includes('com.facebook.react:react-native:+')) {
          content = content.replace(/['"]com\.facebook\.react:react-native:\+['"]/g, "'com.facebook.react:react-android'");
          fs.writeFileSync(bgPath, content, 'utf8');
          console.log('[patch-rn-cpp] Patched react-android dependency in:', pkg);
        }
      } catch (e) {}
    }
  }
}

function scanAndProvisionPrefab(rootDir) {
  if (!fs.existsSync(rootDir)) return;
  try {
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(rootDir, e.name);
      if (e.isDirectory() && e.name !== '.git') {
        if (e.name === 'cmake' && full.includes('prefab')) {
          if (full.includes('aarch64-linux-android')) {
            provisionReactAndroidConfig(full, 'arm64-v8a');
          } else if (full.includes('x86_64-linux-android')) {
            provisionReactAndroidConfig(full, 'x86_64');
          }
        } else {
          scanAndProvisionPrefab(full);
        }
      }
    }
  } catch (e) {}
}

// 1. Patch node_modules
const rootDir = path.resolve(__dirname, '..');
const nodeModulesDir = path.join(rootDir, 'node_modules');

patchGraphicsHeader(path.join(nodeModulesDir, 'react-native', 'ReactCommon', 'react', 'renderer', 'core', 'graphicsConversions.h'));
patchGraphicsHeader(path.join(nodeModulesDir, '.pnpm_patches', 'react-native@0.86.3', 'ReactCommon', 'react', 'renderer', 'core', 'graphicsConversions.h'));
patchReanimatedInterpolator(nodeModulesDir);
patchSubprojectBuildGradles(nodeModulesDir);

// 2. Patch .aar file in Gradle cache
const aarDir = path.join(os.homedir(), '.gradle', 'caches', 'modules-2', 'files-2.1', 'com.facebook.react', 'react-android');
if (fs.existsSync(aarDir)) {
  try {
    function findAars(dir) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) findAars(full);
        else if (ent.name.endsWith('.aar') && ent.name.includes('0.86.3')) {
          patchAarFile(full);
        }
      }
    }
    findAars(aarDir);
  } catch (e) {}
}

// 3. Patch extracted transforms in Gradle caches
const baseTransforms = path.join(os.homedir(), '.gradle', 'caches');
if (fs.existsSync(baseTransforms)) {
  try {
    for (const v of fs.readdirSync(baseTransforms)) {
      const tDir = path.join(baseTransforms, v, 'transforms');
      if (fs.existsSync(tDir)) {
        for (const t of fs.readdirSync(tDir)) {
          const transformedDir = path.join(tDir, t, 'transformed');
          if (fs.existsSync(transformedDir)) {
            for (const candName of fs.readdirSync(transformedDir)) {
              if (candName.startsWith('react-android-0.86.3')) {
                const cand = path.join(transformedDir, candName, 'prefab', 'modules', 'reactnative', 'include', 'react', 'renderer', 'core', 'graphicsConversions.h');
                if (fs.existsSync(cand)) {
                  patchGraphicsHeader(cand);
                }
              }
            }
          }
        }
      }
    }
  } catch (e) {}
}

// 4. Provision prefab ReactAndroidConfig in all .cxx dirs
scanAndProvisionPrefab(path.join(rootDir, 'apps', 'mobile', 'android', 'app', '.cxx'));
if (fs.existsSync(nodeModulesDir)) {
  for (const ent of fs.readdirSync(nodeModulesDir)) {
    const cxxDir = path.join(nodeModulesDir, ent, 'android', '.cxx');
    if (fs.existsSync(cxxDir)) {
      scanAndProvisionPrefab(cxxDir);
    }
  }
}

console.log('[patch-rn-cpp] Done.');
